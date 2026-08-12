# Tests

Reasoning behind the harness and every trap the suite has hit. The rules are in
the root `AGENTS.md`; this is why they hold.

**Tests are colocated in `src/`, beside what they test. There is no `tests/`
directory and no `@tests` alias.** A previous layout kept everything under
`tests/` mirroring `src/`; it was replaced because a mirror is a second place to
remember, and deleting a feature left its tests behind. Now
`rm -rf src/features/<name>` takes that feature's unit tests, e2e specs, and
route assertions with it.

- **Vitest** collects `src/**/*.test.ts`. Nothing is collected from the
  repository root, and nothing should be: a test whose subject is a root config
  file still belongs beside the module whose behavior it protects, reaching the
  config through `~/`.
- **Playwright** collects `src/**/*.spec.ts`. `testMatch` is pinned to
  `*.spec.ts` and that is **not optional**: Playwright's default also matches
  `*.test.ts`, so without it Playwright tries to run the Vitest suite and fails
  with `Vitest failed to find the runner`.

A feature's e2e spec lives at its root (`src/features/items/items.spec.ts`), not
under `client/` or `server/` — it exercises the whole slice through a browser
and belongs to none of them. Same reasoning as `rpc.ts` and `nav.ts`.

**Each unit owns its route assertions.** `src/app/routes.test.ts` covers `/`,
`/health`, and `/settings`; `src/features/items/routes.test.ts` covers that
feature's pages and endpoints. Putting every path in one app-level test would
make deleting a feature break a file it does not own.

**Never put a test file inside a mounted routes directory.** The route generator
scans those directories, so `src/features/items/routes/pages/foo.test.ts` would
be generated into the route tree as a page.

The harness lives in `src/app/testing/` — it is app infrastructure, shared by
every suite, and it is excluded from the Docker build context along with all
`*.test.ts` / `*.spec.ts` by `.dockerignore` patterns rather than by directory.

Test databases live under `.tmp/`, built by `prisma migrate deploy` and never
shared with `data/`.

Setup files are named `<scope>.setup.ts` so they cannot be caught by either
collection glob:

- `unit.setup.ts` — Vitest `setupFiles`, run once per test file.
- `unit.global.setup.ts` — Vitest `globalSetup`, run once per suite. Vitest has
  both hooks, so "unit" alone cannot name them; the longer name is the one that
  runs less often.
- `e2e.setup.ts` — Playwright `globalSetup`.

Two helper modules, and the split is load-bearing:

- **`src/app/testing/db.ts`** — paths and `migrateInto`, nothing else. Both
  suites and `playwright.config.ts` load it, so it **must stay free of Prisma**:
  importing the client here would pull it into Playwright config evaluation.
- **`src/app/testing/e2e.ts`** — everything else e2e, so a spec has one import:
  `seedItems`, `totalItems`, and the extended `test`/`expect`. It was three
  files while the suite ran a server per worker; one worker did not justify
  three.

This is a template — tests exist to demonstrate the harness, not to cover the
demo `Item` domain. Keep one representative case per mechanism rather than
asserting the same behavior at the unit, API, and browser layers.

The layout has e2e coverage only, in `src/app/layout.spec.ts`. Its assertions
are geometric — the content column's gutters match, the navbar's right edge
meets the content's left edge — because that is what the design actually claims.
One case asserts on **console** errors rather than `pageerror`, since React
reports hydration mismatches to the console and the `page` fixture would never
see them.

**The suite runs in `node`. `src/app/client/hooks/useAsyncAction.test.ts` is the
one exception**, opting into jsdom with a `// @vitest-environment jsdom`
docblock so the default is untouched. It earns it by being state with no markup:
the hook's pending and error transitions have no DOM a browser could assert
against, and its toast opt-in is asserted against the notifications store rather
than a rendered toast — which is what makes the "raises nothing by default" case
cheap enough to keep, and that case is what protects `Settings`. Playwright
remains the UI story — a new component gets an e2e case, not a jsdom one.

**A `page` fixture fails any test whose page emits an uncaught `pageerror`.** It
overrides Playwright's built-in rather than being an auto fixture, so a spec
using only `request` still builds no browser page. A hydration mismatch reaches
the console and nothing else, so without it that class of bug fails no test.

Two mechanical traps in `src/app/testing/e2e.ts`: each fixture's second
parameter is named **`provide`, not Playwright's usual `use`** —
`rules-of-hooks` reads any `use()` call as a React hook and fails the lint — and
`test.extend` keeps its **`{}` first argument**, which Playwright parses to
resolve fixture names. Neither is style.

**Playwright's name matching is a case-insensitive _substring_ by default**, and
that is the single most expensive thing to relearn here. Every control in a row
is named after its item — "Edit undo me", "Delete undo me", "Show timestamps for
undo me" — so a bare `getByRole("button", { name: "Undo" })` matches four
elements and fails in strict mode, and `getByRole("cell", { name })` matches
every cell in the row. **Any accessible name built from data needs
`exact: true`.** Two more, both Mantine-specific and both silent:

- **`getByLabel` on a `Select` resolves to two elements once it is open**,
  because the input and the dropdown listbox point at the same label element.
  Use `getByRole("combobox", { name })`.
- **A `Popover.Dropdown` is labelled from its trigger** through
  `aria-labelledby`, which outranks any `aria-label` written on it. Locate it as
  an unnamed `getByRole("dialog")` and let the assertions inside it carry the
  meaning; an `aria-label` there is inert, and a name assertion against it
  passes only by substring accident.

One harness technique is worth knowing about, because nothing else in the suite
can do it: **`page.route` plus `Promise.withResolvers` holds a mutation open and
then fails it.** Holding the request makes an in-flight assertion deterministic
instead of a raced window, and aborting it exercises a failure branch that no
amount of ordinary driving reaches. Note `Promise.withResolvers` rather than a
`let release = () => {}` placeholder, which is the reflex and fails
`unicorn/consistent-function-scoping` with a message that does not point at the
fix.

**A case that leaves a row behind cannot be repeated.** `--repeat-each` is the
natural tool for a case with a timed toast in it, and a survivor turns the
second run into a strict-mode violation reported as a locator error rather than
a timing one. The delete-family cases each end with their rows gone for that
reason.

**A case that leaves a _job_ running breaks the next one**, and only under
Docker, where the subprocess is slow enough for it to matter. A job's Run now
button is disabled while it holds the lock, so the following test clicks a
disabled button and times out with no clue why. Every case that starts a job
ends by waiting for its button to be **enabled** again. Waiting for a `success`
badge instead does not work — an earlier run's badge satisfies it immediately,
which is how this was misdiagnosed twice.

`src/app/server/log/query.test.ts` fakes **`Date` only**, and clears the table
before installing the timers. Faking the rest stops the handler's unawaited
writes from ever running, and awaiting Prisma under fake timers hangs.

Two guards keep the suite off the real database, and both must stay:

- `assertServerSharesDatabase` writes SQLite directly to prove the server reads
  the same file. Everything else seeds over the REST API; this one check cannot,
  because over HTTP it would be undetectable.
- The `DATA_DIR` assertion in the service test's `beforeEach`. Without it, a
  missing setup file would truncate `./data`.

Ordering assertions rest on sequential awaited inserts, not fixed timestamps.

The API key rides in `use.extraHTTPHeaders`, so seeding needs no explicit
header. That reaches **every** context the suite builds, including ones made
with `apiRequest.newContext`, which is why `auth.spec.ts` asserts
unauthenticated behavior with raw `fetch` — it sends only what is written at the
call. A test that builds its own context is not opting out of the key.

**The e2e suite is serial: one server, one database, `workers: 1`.**
`e2e.setup.ts` migrates `.tmp/e2e` and `playwright.config.ts` starts one server
on `E2E_PORT` against it. A parallel model with a server and database per worker
was tried and removed — the isolation was sound, but it cost a per-worker
template copy, `parallelIndex` keying across three files, and a second code path
in every one of them, which is not what a starter should be teaching.

Raising `workers` is not a config change: workers share a process-level
`DATA_DIR`, so more than one would put every test on the same database
concurrently. Going parallel means restoring per-worker servers and directories
together, or not at all.

The unit suite still migrates one template and copies it per test file — there
the copy is per _file_ and `migrate deploy` replays every migration, so it earns
itself. The e2e suite has a single database and needs no template.

**The database is per run, not per test.** Nothing empties it, so the suite
accumulates data the way a running install does and no test ever sees the
empty-table case a real user is never in. Per run rather than per test is what
keeps a failure reproducible; persisting across runs would not.

That makes absolute counts meaningless, and every assertion has to be written
accordingly:

- Take `totalItems(request)` **before** seeding and assert the delta, never a
  literal total.
- Scope list assertions with a prefix unique to the test — `paged item` in
  `items.spec`, `api page` in `api.spec` — so another test's rows cannot satisfy
  or break a count.
- Lean on `createdAt desc` instead of emptiness: freshly seeded rows head page
  one, so `slice(0, n)` identifies them whatever precedes them.

Tests must not depend on each other's leftovers either. Relative assertions are
what buys that, so a spec that needs an exact count is a spec to rewrite, not a
reason to reintroduce truncation.

`yarn test:e2e:docker` (`dev/e2e.sh`) runs the same specs against the real
image. It scopes every compose call to its own project via
`COMPOSE_PROJECT_NAME`, so one `compose down --volumes --rmi local` removes the
container, network, and its image on exit. Everything it creates is unique to
the run, and it never touches `untitled:local`, the container `run.sh` manages,
or `data/`. `E2E_TARGET=docker` drops `webServer` and `globalSetup` — the
container migrates its own database, so running the suite's migration would
delete the file it already has open. Its mount is deliberately not `E2E_DIR`:
the image runs as uid 1000, so a shared directory would leave files a local run
cannot manage.

**`dev/e2e.sh` starts the container with `TEST=1`, and that is not cosmetic.**
The local target disables the scheduler through `CI`, which the container never
sees — so before this, the Docker run raced a **real** scheduler: both jobs are
due on a fresh database, the backup job took the lock while a test was pressing
Run now, and archives appeared that no test had asked for. It failed
intermittently and only under Docker. `compose.yaml` passes `TEST: ${TEST:-}`
for it, empty in normal use.

**Under that guard the plugin does nothing at all**, and the jobs page still
lists jobs: the RPC handlers call `ensureJobsRegistered` themselves, which is
what makes the page work regardless. Registration sat above the guard for a
while as the first, wrong fix for an empty page — the bundle split was the real
cause, and once the RPC side registered its own copy the hoist stopped doing
anything.

Teardown is a trap on `EXIT INT TERM`, and Playwright runs as a background job
the script `wait`s on. Both matter: bash runs no `EXIT` trap for an untrapped
signal, and defers any trap until the current foreground child returns.

Only `EXIT` cleans up — the `INT`/`TERM` traps just `exit 130`, which runs it.
Having them call it directly is what would need a reentrancy guard, since the
`exit` fires `EXIT` after. That trap is also the only thing that kills the
suite: a signal sent to the script does not reach a background job.
