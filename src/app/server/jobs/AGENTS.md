# Jobs

Reasoning behind the scheduler, the lock, the workers, and backup/restore. The
rules are in the root `AGENTS.md`; this is why they hold. The `/backups/$name`
download route is covered in `src/routes/AGENTS.md`.

`src/app/server/jobs/` holds a scheduler, and it exists because `archiveLogs`
had no caller. Two jobs are registered today: `archive-logs` (inline, daily) and
`backup` (subprocess, on the interval the settings page owns).

**Jobs and backups live under `/system`, not `/settings`.** A schedule is not a
preference, and neither is a list of archives — those pages report what the
instance is doing and act on it. `/settings` keeps what a person chooses:
instance name, API key, log level, and the UI preferences.

**The backup _policy_ moved with the controls**, which reverses an earlier
split. Folder, interval, and retention genuinely are preferences, so they
belonged in `/settings` by that rule — but separating them from the list, the
Run now, and the restore they govern put one feature across two sections, and a
page you have to leave to change the thing you are looking at is worse than a
rule kept tidily. They still write through the settings service; the store does
not have to match the page.

**Registration is explicit, in `jobs.ts`, not a glob.** Jobs are core rather
than pluggable, and an empty registry is silent in a way an empty navbar is not.

**`ensureJobsRegistered` is idempotent and is called from both sides of the
bundle split, which is not optional.** Measured: the Nitro plugin is bundled
into `.output/server/index.mjs` while server functions land in `_ssr` chunks,
and **each gets its own copy of the registry module** — two separate `Map`s, at
`index.mjs:568` and `_ssr/width-*.mjs:43`. The plugin's registrations are
invisible to the RPC handlers, which is why the settings page listed no jobs at
all until registration became lazy on both sides.

**That is only survivable because a registration is a static description.**
Every piece of real state — the lock, the history, progress — lives in the
database, which both bundles share. **Never keep mutable job state in a
module-level variable**; the plugin and the request path will disagree about it
and nothing will fail loudly.

**The scheduler starts from a Nitro plugin**, registered as
`nitro({ plugins: ["./src/app/server/jobs/startup.ts"] })` in `vite.config.ts`.
Measured: a plugin runs inside `useNitroApp()`, which the generated server calls
**immediately before `serve()`** — so it fires before the socket binds, and an
idle install still runs its jobs. This is the same call that is useless for the
port, because `port` and `host` are read from `process.env` three lines earlier;
the difference is that a scheduler does not care when it starts, only that it
does.

**Starting it from the request middleware instead was rejected.** A host install
with no traffic would never take a backup, and a container would depend on the
`HEALTHCHECK` polling `/health` to wake it.

**The plugin must never throw**, because an exception there is a server that
does not start. It catches, reports to the console, and lets the app come up
without a scheduler.

**It `await`s `loadLogLevel()` first, and that stays.** Nothing has served a
request yet, so the middleware that normally applies the stored level has not
run. It was dropped once as redundant — `runJob` refreshes per run, so jobs
themselves do not need it — and put back, because without it the plugin's
**own** lines go out at the default: a stale-run reclaim warning prints on an
instance set to `error`, and the scheduler's trace is missing on one set to
`trace`. One query at startup is the cheaper side of that trade.

**The plugin skips the scheduler when `CI` or `TEST` holds a value**, because a
real scheduler races the e2e suite's jobs. It reads both through `envValue`, so
an empty value counts as unset: `compose.yaml` passes `TEST: ${TEST:-}`, which
is empty in every normal deployment, and a check for `!== undefined` turned the
scheduler off in production Docker.

**`vite.config.ts` is load-bearing now.** Drop the `plugins` entry and the build
stays green while nothing is ever scheduled. `startup.test.ts` asserts the entry
against the config source, the way `level.test.ts` asserts `loadLogLevel`
against `src/start.ts`.

## The adaptive timer

There is no fixed tick. `scheduler.ts` computes the soonest `dueAt` across the
registry and sets **one** `setTimeout` to it, rescheduling after every sweep. A
one-minute job fires at one minute; an idle weekly job costs one read per job a
minute.

**Both clamps are load-bearing, and the ceiling is a bug fix rather than
tidiness.** Above 2^31−1 ms `setTimeout` does not sleep — it warns
`TimeoutOverflowWarning` and fires after about a millisecond, measured — so an
uncapped 30-day interval would spin instead of waiting. `MIN_DELAY_MS` of one
second stops a perpetually-due job from becoming a hot loop.

**`MAX_DELAY_MS` is one minute, and it is the whole mechanism by which a changed
interval takes effect.** It was an hour, with a `rescheduleJobs()` call from
`updateSettings` meant to wake the timer early. Measured in `.output`: the
scheduler module is bundled twice, once into `index.mjs` beside the plugin that
starts it and once into the `_ssr` chunk the request path runs, and a settings
write executes in the second copy — where no timer exists to reschedule. The
call was a no-op in production and the hour was the real latency. A one-minute
ceiling makes the ceiling honest and costs one `findFirst` per job per minute;
do not reintroduce a cross-bundle wake-up through module state.

**Intervals are milliseconds** (`registry.ts` exports `SECOND_MS` … `DAY_MS`).
They were days, which made anything shorter than a day a fraction.

## The lock

`runningSince` and `runningPid` on the `Job` row, taken with **one conditional
`updateMany`** so two callers cannot both believe they won.

**Staleness is a timeout, never a liveness check on the pid.** Pids are reused,
which is the same reason `archiveLogs` does not inspect the pid on a temporary
file. The ceiling is generous, because reclaiming a lock a live run still holds
is the worse mistake.

**Catch-up needs no code of its own.** A job is due when its last run's
`startedAt + interval` has passed, and an interval that elapsed while the
process was down is indistinguishable from one that elapsed while it was up. A
job that has never run is due, so a fresh install produces its first archive and
its first backup rather than waiting out an interval.

**A crash would otherwise lock a job out for six hours**, which is exactly when
it should run: `runningSince` survives the crash and `runningPid` points at a
dead process, so `acquire` refuses until the stale window elapses.
`reclaimStaleRuns()` runs at startup, before scheduling — it marks every
`running` row `interrupted` and releases every lock, after which the ordinary
due check picks the job up. There is no separate resume path, and **that is a
contract: a job must be safe to re-run from the beginning**, because nothing
here checkpoints.

**Reclaiming every lock at startup assumes one scheduler.** With two instances
it would stomp a live run. The multi-process story is designed for and untested;
this is the line that would have to change first.

## History and progress

`Job` holds the lock alone. **`JobRun` is the history and the single source of
truth for "last run"** — a row per run, inserted as `running` when the lock is
taken and closed out on the way through, so a run in flight is a row rather than
only a timestamp. Deriving the last run from it means there are no denormalised
`last*` columns to disagree with it.

**`describeJob` in `runner.ts` is the one shape a page renders for a job**, and
`latestRun`/`runningRun` in `history.ts` are the two queries beneath it. The
jobs page maps it over the registry; the backups page calls it for `BACKUP_JOB`
and reads `running` and `last` from the same object, so the name `"backup"` is
spelled once, in `jobs.ts`. Two pages each hand-rolling the "latest finished run
plus the run in flight" pair was the shape this replaced.

**Progress is a framework capability, not a backup feature.** Every job receives
a `JobContext` with `report(percent, note?)`; one with nothing meaningful to say
ignores it and the UI shows a spinner, which is honest. A subprocess job gets it
for free — `runWorker`'s `onProgress` carries whatever the child sends, and
`backup.ts` turns page counts into a percentage so the job never learns how the
number travelled. Writes are throttled to whole-percent changes, because the
worker reports once per page batch. Losing progress must never fail a run, so
the update is fire-and-forget with a swallowed rejection.

## A run's logs

`runJob` wraps the **whole** run — its own start and finish lines included — in
`withCorrelation`, an `AsyncLocalStorage` in `@/app/server/log/context`. Every
record emitted beneath it carries the run id, so a run's logs are
`queryLogs({ requestId })`: the same query, and the same column, that
reassembles an HTTP request.

**`currentRequestId` checks the job context first, and the order is
load-bearing.** A job started from the settings page runs _inside_ a request, so
the request id would otherwise win and scatter that run's records under an HTTP
id. The innermost unit of work is the one worth correlating by.

**A worker has no logger**, so `runWorker` relays the child's stdout and stderr
line by line into the parent's, inside that correlation. Worker output is part
of the run's log rather than something visible only in a failure message.

Two holes worth knowing: **`archiveLogs` drains the log table**, so a run's logs
live as long as any log does and then move to an archive file — the same deal a
request already has. And **the archive job itself has no logs**, because it uses
a console-only logger deliberately; writing into the table it drains would feed
its own next run.

**A failed job is not a `ReportableError`.** Nobody is standing in front of a
scheduled run, so the failure lands on the row and is logged at `error`; the
settings page reports it from there. A job that fails while nobody is watching
must still be visible when somebody looks.

## The two runners

**`runDueJobs` runs due jobs in parallel**, through `Promise.allSettled`. The
per-job lock already makes concurrent execution safe, and a slow job must not
delay a fast one's turn — which starts to matter once intervals are measured in
minutes. `allSettled` keeps the property the sequential loop had: one job
throwing does not stop the others.

**Inline** is an ordinary async function. **Subprocess** is `child_process.fork`
on a `.ts` entry, run by Node's type stripping — which is what
`erasableSyntaxOnly` in `tsconfig.json` is for, since non-erasable syntax in a
worker fails at run time rather than at build.

**A worker imports nothing from `src/`, and nothing from `node_modules`.** It
takes a JSON payload and uses `node:` builtins only. That keeps it free of the
`@/` alias, which bare `node` does not resolve, and it is why the parent owns
all state and the child owns one computation.

**The payload goes on `argv`, never over IPC, and this is the sharpest trap in
the directory.** Measured: attaching `process.on("message")` in the child makes
`node:sqlite`'s `backup()` **never resolve** — no error, no timeout, it simply
stalls forever. The same backup completes in 2ms with fork-and-IPC but _no
listener_, and in 1ms standalone; deferring the work out of the handler with
`setImmediate` does not help, so it is the listener itself. A child that never
listens can still call `process.send`, so progress still flows upward. **Do not
move a payload back onto IPC.**

**A worker reporting progress must wait for `send`'s callback before exiting.**
`process.send` is asynchronous, so exiting straight after it drops the message.

**Workers are copied into the image, not bundled.** `runtime` has
`COPY src/app/server/jobs/workers`, because they are forked as files at run
time. A worker in a directory nobody copied fails only in the container, where
`yarn ci` cannot see it.

## Backup and restore

**The copy is `node:sqlite`'s `backup()`, from the worker — never `VACUUM INTO`
through Prisma.** Measured on a 122MB database: `VACUUM INTO` blocks the event
loop for its full 194ms, long enough for the Docker health check to fail
mid-backup; `backup()` is incremental, yields between page batches, and is
faster at 168ms with a 1.6ms worst stall.

**This is the one sanctioned exception to "everything goes through the Prisma
client, nothing imports `node:sqlite`", and the boundary is narrow: a read-only
connection, in a separate process, for an operation Prisma cannot express.** WAL
gives concurrent readers, so it contends with nothing and sets no pragma behind
Prisma's back. Do not widen it to the main process.

**An archive holds `app.db` and `manifest.json`, and no WAL sidecars.**
`app.db-wal` and `app.db-shm` do not survive a clean close — measured — and
`backup()` writes one consistent file from a live database anyway. A raw file
copy would need them, which is why the copy is not a raw file copy.

**The zip container is `node:zlib`'s own — `ZipEntry`, `ZipFile`, and
`createZipArchive`, added in Node 26.8.** Before that Node had the compression
but no zip reader or writer, and `fflate` supplied the local file headers,
CRC32, central directory and EOCD record; it was removed the release those
arrived. Measured before switching: Node reads the archives `fflate` wrote and
`fflate` reads Node's, so existing backups stay restorable and other tools still
open ours.

**Both directions stream, and the shapes that stream are specific.** Writing is
`createZipArchive([...])`, which returns a `Readable` to pipe into the temporary
file — `ZipEntry.createStream("app.db", createReadStream(...))` compresses on
the way through. `ZipFile.open(path, { writable: true })` is not the write path:
it needs an existing valid archive and refuses an empty file. Reading is
`ZipFile.open` and `entry.contentIterator()` piped to the staging file, bounded
per chunk; `content()` is only for the manifest. The container is capped at
512MB in `compose.yaml`, and a database read whole plus its compressed output
would approach that. Measured: a 64MB database streams out with a 35MB rise in
RSS and back in with none.

**The API is Stability 1.0 — experimental — and that is priced in two places.**
`runWorker` forks with `--disable-warning=ExperimentalWarning`, because the
warning goes to stderr once per process and the relay would otherwise log it on
every run. And the Dockerfile pins `node:26.8-slim` rather than `node:26-slim`:
the workers are not bundled, so they run on whatever Node the image has, and a
floating tag could change the API under a rebuild with `yarn ci` still green.
Bumping Node is a deliberate edit, verified by `yarn test:e2e:docker`.

**`zlib-zip.d.ts` beside this file declares the subset of that API the workers
and their tests use**, because `@types/node` 26.4 predates it. It augments
`"node:zlib"`, the primary declaration, which `"zlib"` re-exports. Delete it the
release `@types/node` declares `ZipFile`; `yarn typecheck` will say when, with
duplicate declaration errors. It sits outside `workers/` so the image does not
copy it.

**Restore is in-process, same-version only, and needs no restart.** Measured:
`$disconnect()` → rename the file → `$connect()` on the **same client object**
reads a database it has never opened. No proxy and no mutable module-level
export.

**The version check is what buys all of that.** Accepting an older archive would
mean running migrations after the swap, which would mean a startup step outside
the app — the shim this codebase deleted. `manifest.json` names `APP_VERSION`
and the latest applied migration, and a mismatch is **refused** with a message
naming both, never repaired.

**Order matters, and the last step is the point:** validate, check the manifest,
`$disconnect`, move the current file aside, delete any stale `-wal`/`-shm`, move
the archive's database in, `$connect`, **run one query**, and only then discard
the file moved aside. Any failure puts the old file back and reconnects to it. A
test reaches that path with an archive that passes every check but is unusable
once connected, and asserts the original is not just readable afterwards but
still writable.
