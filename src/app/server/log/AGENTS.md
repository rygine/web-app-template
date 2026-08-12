# Logging

Reasoning behind `src/app/server/log/` and `@/app/shared/utils/log`. The rules
are in the root `AGENTS.md`; this is why they hold.

## The log level

`@/app/shared/utils/log` keeps a module-level current level, and `emit` reads it
**per record** — a property lookup. Precedence is **`LOG_LEVEL`, then the stored
level, then `VITE_LOG_LEVEL`, then `debug`.** The environment is checked first
and synchronously, so an env-managed instance never queries the row, and the
settings control renders disabled with an explanation — the same shape `API_KEY`
gives the key.

Two things fill it:

- **`loadLogLevel()` in `@/app/server/log/logger`**, a memoized promise
  **awaited at the top of `requestContext` in `src/start.ts`**. It queries
  Prisma directly rather than going through the settings service, which imports
  this module for its own logger and would make a cycle. It never throws: an
  unmigrated database or a disk error reports to the console and leaves the
  default, because every request awaits it.
- **`updateSettings`**, which calls `setLogLevel` after a successful write. That
  call is the whole of what "applies immediately" means here.

  **It is memoized, so the query runs once per process, not once per request.**
  Measured: awaiting the settled promise costs **31ns**, against **51µs** for
  the query it avoids and a sync boolean guard's 2ns. There is nothing to
  optimise here; the shape already is the optimisation.

**`refreshLogLevel` exists because the bundle splits this module in two.** One
copy lands in `index.mjs` with the nitro plugin that starts the scheduler, one
in the request path's `_ssr` chunk — so `setLogLevel` from a settings write
updates the request path and leaves the scheduler's copy on whatever it read at
boot. `runJob` refreshes before it logs anything, which costs one query per run:
nothing, next to logging a whole run at the wrong level. Same family as the job
registry's duplicated `Map`.

**This makes `requestContext` load-bearing for a second reason**, beside the
warning below that declaring `requestMiddleware` replaces Start's CSRF default.
Remove or reorder it and every install silently reverts to `debug`.
`src/app/server/log/level.test.ts` asserts the call against the source of
`src/start.ts`, the same way `routes.test.ts` asserts against the generated
route tree, because nothing else would fail.

**The invariant the timing rests on: nothing may log at module scope.** Every
log call in this codebase sits inside a function — the services, the HTTP
wrappers, the middleware, the client hooks — so no server record is emitted
before that await has run. **A log call added at module scope in a server module
would emit at the default level, silently**, and no test would catch it.

`compose.yaml` passes `LOG_LEVEL: ${LOG_LEVEL:-}` with no default, so an unset
variable arrives empty; `isLogLevel("")` is false and it falls through to the
row with no special case for emptiness.

## The logger

`createLogger(namespace, ...handlers)` returns
`trace`/`debug`/`info`/`warn`/`error`, each taking `(message, fields?)`. Output
is `info  [items] createItem: item created id=abc123`.

Messages are `fn: text` — the emitting function, then what happened. It is a
convention rather than anything enforced, and it is what `queryLogs({ search })`
is expected to match against, so a message is a stable phrase and the varying
part goes in `fields`.

The levels are used for:

- **`trace`** — fine detail wanted only while diagnosing something. The request
  lifecycle, which source answered for the API key, a successful read.
- **`debug`** — a branch outcome. A miss, a rejected body, a 405.
- **`info`** — a state change. An item created, a key replaced, an archive run
  completed.
- **`warn`** — a fault that was recovered from, and a rejected caller.
- **`error`** — a fault that was not.

`LOG_LEVEL` defaults to `debug`, so **`trace` is off unless asked for**. That is
what lets the trace sites be per-request without the table growing per request
in a default install.

A `LogHandler` is `(record: LogRecord) => void` — a terminal consumer, which is
why a logger can fan one record out to any number of them. Naming any handler
replaces the default rather than adding to it; with none, the only handler is
`consoleLogHandler`.

The module splits for the same reason Prisma's does:

- **`@/app/shared/utils/log`** — isomorphic and dependency-free. Both sides
  import this; it is in `shared` rather than `client` for exactly that reason.
- **`@/app/server/log/logger`** — the database handler and `createLogger`.
  Composes the console and database handlers, and writes through the Prisma
  client into the `logs` table of the app database. Server code imports this,
  and it must never reach client code.

The rest of the folder is the two things that read the table back —
`@/app/server/log/query` and `@/app/server/log/archive` — each holding what only
it needs, which is why `logsDir` lives in the archive rather than a leaf of its
own.

**`archiveLogs` runs as a scheduled job** — see "Jobs". It kept its console-only
logger, which is now load-bearing for a second reason: a scheduled run that
wrote into the `logs` table would be feeding its own next run.

**There is no file handler.** Writing every record to a daily file was tried and
removed: the database is the durable sink, and `archiveLogs` is what puts
records in a file — on demand, bounded, and deleting what it wrote. Do not add a
second always-on sink without a reason the database cannot serve.

**`src/app/server/utils/prisma.ts` must not log.** The handler writes through
the Prisma client, so a logger there would be circular — and it would be writing
through a client that does not exist yet, since that file is what creates it.
This is the one rule holding the direction open.

Writing through Prisma means one connection for logs and app data, so log writes
cannot contend with app writes for SQLite's single writer, and the `logs` table
is typed like every other. The cost is that **writes are asynchronous while
`log.info` is not**, and everything else follows from how that is resolved:

**Writes are fired and never awaited, and nothing in `src/` orders them or waits
for them.** The adapter is a single synchronous better-sqlite3 connection that
runs statements in the order they are issued, so ids follow emission order —
which is what makes `queryLogs` breaking millisecond ties with the id mean
anything — and any query made afterwards already sees the record. Measured, not
assumed: 300 unawaited creates land complete and in order, and a query issued
immediately after sees all 300. **This is the load-bearing assumption of the
whole handler.**

Two things were tried here and removed. A promise chain ordering the writes by
hand: it reimplemented the driver and put a reassigned module-level `let` in the
path of every log call. Then a `flushLogs` barrier: it had no caller in `src/`,
and in the tests that did call it the following Prisma query was already the
fence, so every one of its twenty call sites was a no-op. Do not reintroduce
either to make the asynchrony feel handled.

Two tests pin the assumption rather than leaving it to luck: **"assigns ids in
the order records were emitted"** and **"stores a write nothing awaited before
the next query runs"**. If a Prisma upgrade ever pools connections or defers
statements, those fail rather than the store silently reordering.

**Nothing needs to flush on `SIGTERM`, and that depends on the driver being
synchronous.** better-sqlite3 completes each write inside its own microtask, and
Node drains every microtask before handling a signal, so outstanding writes land
before the process can observe one. Measured, not assumed: 80 concurrent creates
followed by an immediate `SIGTERM` lost zero records.

Moving to a networked database breaks all of it at once — ordering, visibility,
and the signal safety above — and there is **no shutdown hook to repair it
with**: srvx owns `SIGINT`/`SIGTERM`, its `gracefulShutdown` option takes only
timeouts, and the `serve()` call is inside Nitro's generated output. Changing
the driver means solving that first, not adding a flush.

A failed write is reported to the console and **does not disable logging**. The
handler this replaced gave up permanently after one error, which made sense when
a failure meant a broken file; now the likely cause is a brief lock while
`archiveLogs` deletes, and losing the only durable sink over a transient error
is worse than repeated console noise.

`LOG_LEVEL` (server) and `VITE_LOG_LEVEL` (browser) set the threshold, which
**defaults to `debug` everywhere, production included**, with the stored level
sitting between them — see "The log level" under Configuration for the
precedence and for the startup await that fills it. It is read **per record**
from a module-level variable, so a change reaches loggers that already exist.
**A test therefore has to set the variable before the logger it is testing
emits**, which is why every one of them calls `createLogger` in the test body
rather than at the top of the file, and why `log.test.ts` clears the module
level in its `afterEach`.

`LOGS_DIR` holds the `archive/` directory — **log files, nothing else.** The log
store itself is a table in the app database at `DATA_DIR`. Both it and
`DATA_DIR` are real host-development settings and appear in `.env.example`; for
the container they are pinned in `compose.yaml` so a value in `.env` cannot
reach it. The host side is `LOGS_PATH`, or the second argument to `dev/run.sh`.

Records leave the app in two shapes. The console stays human-readable; anything
written for machines is JSON Lines, one self-describing record per line, which
is what `archiveLogs` emits:

```text
{"time":"2026-08-06T02:42:01.139Z","level":"info","namespace":"items","message":"createItem: item created","fields":{"id":"cmsg…"}}
```

The pretty format cannot be parsed back once a message contains a bracket, so
`formatLine` is for humans only and never for a file.

## The database

**Everything the logger emits** goes to the `logs` table in the app database,
and there is **no switch for where it lands** — `DATA_DIR` decides that, never
whether it happens. It is the only durable sink and the store `queryLogs` reads,
so a flag naming the destination could only ever turn logging off by accident.

The handler has no floor of its own: `LOG_LEVEL` is the single threshold, and
whatever clears it reaches both the console and the table. It defaults to
`debug`, so per-request debug traffic is stored by default and the table grows
accordingly — `archiveLogs` is what bounds it, and lowering `LOG_LEVEL` is what
reduces it at the source. `logLevel: "off"` in the settings (see
"Configuration") is genuinely a switch, since `"off"` ranks above every real
level in `LOG_RANK` — but it is a threshold set at boot, the same lever
`LOG_LEVEL` always was, not a second mechanism layered over it.

**The table is declared in `schema.prisma` and created by a migration, never by
the handler.** Prisma owns this database, so a table it does not know about is
drift, and `prisma migrate dev` answers drift by offering to reset. A
`CREATE TABLE IF NOT EXISTS` in the handler would be a reset waiting to happen.
The handler assumes the table exists; against an unmigrated database every write
fails to the console, which is why migrations run before the server.

`time` is ISO 8601 **text**, not `DateTime`. The handler, the query, and the
archive all compare and slice it as a string, and ISO 8601 sorts
chronologically, so text keeps one representation across all three.

Ids are `AUTOINCREMENT` and that is load-bearing — see the archive below.

A separate log database was tried and removed. It bought a volume split that
kept logs off the app's disk, and cost a second file to back up, a second schema
with no migrations, and a second thing to point somewhere disposable in every
test harness. One database, one set of migrations.

**Everything goes through the Prisma client, with one exception: the backup
worker (see "Jobs") opens a read-only `node:sqlite` connection in a separate
process.** Nothing in the server process may. One connection serves the handler,
the query, and the archive, so nothing can contend with app writes for SQLite's
single writer and no code sets a pragma behind Prisma's back. `queryLogs` and
`archiveLogs` are therefore **async** too.

`queryLogs` composes SQL with `Prisma.sql` instead of using `findMany`, and the
reason is narrow: `search` is a **literal** substring, and Prisma's `contains`
emits a `LIKE` with no `ESCAPE` clause, so `_` and `%` in the caller's text act
as wildcards — `item_c` matches `item: created`. Log messages contain both
routinely. Every value is a bound parameter and `Prisma.join` builds the lists,
so nothing is interpolated by hand. Use `findMany` for anything that does not
need the escape.

`queryLogs` in `@/app/server/log/query` reads it back — filter by time range,
namespace, minimum level, and a case-insensitive message substring, with paging.
Ordering is `time DESC, id DESC`: timestamps are millisecond-resolution, so
insertion order breaks ties. Search is a literal substring, so `%` and `_` are
escaped before they reach `LIKE`, and the case-insensitive match is SQLite's own
— `LIKE` is case-insensitive for ASCII.

`level` is a **minimum** severity, and it is resolved in TypeScript: `atOrAbove`
expands it against `LOG_RANK` and the query sends the resulting level set, so
the ranking stays defined in one place instead of being encoded in the column.
The `total` comes back through `$queryRaw`, where an aggregate can arrive as a
`BigInt`, so it is narrowed rather than trusted.

`archiveLogs` in `@/app/server/log/archive` moves rows back out to JSON Lines —
the one self-describing record per line, so an archive reads with the same tools
as any other JSON Lines log. `maxFileSize` rolls to a new file, counting
**uncompressed** bytes because gzip output size is not known until a file is
closed; `compress` gzips each file.

**It is a move, not a copy**, and that is what bounds the database. Each file is
its own unit of work: written, then its rows deleted, then counted. A run
interrupted halfway keeps the files it finished and leaves the rest in the
database for the next one.

Four things make that safe, and all of them are load-bearing:

- **Files are written to a temporary name and renamed into place.** Rename is
  atomic, so a reader never sees a half-written archive — the failure that a
  plain `writeFileSync` leaves behind is a truncated file with a torn last line,
  which nothing downstream can tell from a complete one. The handle is `fsync`ed
  before the rename, or the rename can land before the bytes.
- **Names come from the rows, not the clock** — `logs-<day>-<firstId>-<lastId>`.
  A crash between the write and the delete leaves those rows in place, so the
  next run selects the same rows, computes the same name, finds the file already
  there, and skips the write. That closes the duplicate window rather than
  merely making it recoverable. It only works because of the point above:
  partial files never occupy the final name.
- **Ids are `AUTOINCREMENT`, so they are never reused.** A plain
  `INTEGER PRIMARY KEY` restarts at 1 once the table is emptied, which archiving
  does on every run. New rows would then compute a name an earlier archive
  already holds, the run would skip the write as a duplicate, and it would
  delete the rows anyway — silent loss, reported as success. The skip above is
  only safe because a repeated name can mean nothing but the same rows.
- **Rows go after their file is on disk, and are counted after the delete
  commits.** A caller is never told entries moved that did not.
- **It deletes the id range it wrote**, never the whole table, and pages by an
  id cursor rather than iterating one open result set — deleting from a table
  with a live cursor over it is undefined. Deletes stay behind the cursor.
- **A lone line is written whatever its size.** `maxFileSize` is checked only
  once something is buffered, so a single entry larger than the limit goes out
  in a file of its own rather than rolling forever without progress.

`error` on the result is set when a run stops early, because this is meant to
run unattended and a silent empty result is indistinguishable from having
nothing to archive. `files` and `entries` still describe what completed. It is
also logged, at `error` — a returned value nothing reports is silent for
something that runs on a schedule.

**The archive's own logger is console-only, and it is the one exception to
everything reaching the table.** It takes `createLogger` from
`@/app/shared/utils/log`, where the default handler is the console one, rather
than the composed logger in `@/app/server/log/logger`. This is what drains the
`logs` table, so a record written into it becomes input to the next run: on an
idle system the archive would find exactly its own last record to move and write
a single-line file every run, forever. The reason is the same circularity that
keeps `src/app/server/utils/prisma.ts` from logging.

**Nothing logs inside the read loop**, and `flush` is silent for it. A record
emitted there becomes a row past the cursor that the next `findMany` returns,
and whether that terminates is not worth a debug line. Log before the loop and
after it.

`queryLogs` is the other direction and keeps the database handler, but traces
**only** at `trace`: reading the log table writes to the log table, so at the
default level it emits nothing and only costs rows when someone has asked for
them. Do not raise it to `debug`.

**No `VACUUM`.** It ran when logs had their own file, where deleted pages were
stranded. Sharing the app database changes both halves of that: the freed pages
get reused by ordinary writes, and a `VACUUM` would take an exclusive lock and
rewrite every row in the database — including every `Item` — as a side effect of
archiving logs. Do not add it back.

A crash mid-write leaves a `.<pid>.tmp` file, and every run sweeps ones older
than an hour before doing anything else — including runs with nothing to
archive. **Never treat a temporary as data to recover.** Its rows were not
deleted, so everything in it is still in the database; the file is garbage by
construction. That is also why the sweep is safe: deleting one belonging to a
live run costs that run and nothing else, which is a better trade than checking
whether a pid is alive, given pid reuse.

Neither `queryLogs` nor `archiveLogs` is exposed over HTTP. Logs carry ids,
paths, and error messages, so any endpoint or UI over them needs authentication
first — and a fast, paged query makes exposing it more tempting, not less.

Logs live on their own volume rather than `/data` so they cannot fill the disk
the database is on. The container root filesystem is read-only, so `/logs` and
`/data` are the only writable persistent paths.

Do not log in `src/routes/health.ts` — the Docker `HEALTHCHECK` probes it every
10s and would flood a capped log. Do not log in
`src/app/server/utils/database.ts` either; it is loaded by the Prisma CLI and
would pollute migration output.
