# untitled

A TanStack Start + Prisma + Mantine starter.

> [!CAUTION] **Run this on a trusted network, not the public internet.** The
> `/api/v1` routes take an API key, but it identifies callers rather than
> securing anything: `/settings` displays the key without authentication, and
> the server functions the UI calls take no key at all. There is no user system
> and no rate limiting.

## Make it yours

A few files carry an `untitled` placeholder. Replace them manually yourself, or
paste this into your coding agent:

```text
Rename this starter from its placeholder name "untitled" to <YOUR APP NAME>.

Replace it in package.json (`name`), compose.yaml (the `IMAGE` and
`CONTAINER_NAME` defaults), dev/*.sh, and the prose in README.md and AGENTS.md.
Nothing under src/ carries it — the navbar and document title read the
package.json `name` through a build-time define.

Package name, image tags, container names, and COMPOSE_PROJECT_NAME must all be
kebab-case, and the navbar renders that same string. Only the README heading
takes a display name as written.

Then run `yarn install` — the workspace entry in yarn.lock is keyed by package
name and re-sorts, so `yarn install --immutable` fails in CI until it does.

Finally, delete this "Make it yours" section from README.md, and confirm
`grep -ri untitled .` finds nothing outside node_modules.
```

## Project layout

`src/` has two parts: **core** and **features**.

```text
src/
  app/                      core — belongs to no single feature
    client/   components/ contexts/ hooks/ layouts/ utils/
    server/   log/ services/ utils/
    shared/   utils/
    testing/                the shared test harness
    rpc.ts                  server functions the app itself exposes
    nav.ts                  the app's own nav entries
    schema.prisma           generator, datasource, ApiKey, Log
  features/
    items/                  a worked example — delete it
      rpc.ts                server functions this feature exposes
      nav.ts                how it appears in the navbar
      schema.prisma         model Item
      items.spec.ts         its end-to-end tests
      api.spec.ts           its REST endpoint tests
      routes.test.ts        asserts its routes are mounted
      client/components/
      server/services/
      shared/schemas/
      routes/pages/         mounted at /items
      routes/api/v1/        mounted at /api/v1/items
  routes/                   app-level routes only
  routes.config.ts          composes the route tree, discovers features
```

Inside `app/` and inside every feature, the first level says **where the code
runs** and the level below says **what it is**:

|           |                                                   |
| --------- | ------------------------------------------------- |
| `client/` | ships to the browser (it also renders during SSR) |
| `server/` | never reaches the browser                         |
| `shared/` | safe in both                                      |

Create these only when a feature needs them — a client-only feature has just
`client/`.

### Adding a feature

1. `src/features/<name>/` with whatever of `client/`, `server/`, `shared/` it
   needs.
2. `rpc.ts` for its server functions, `nav.ts` for its navbar entry, and
   `schema.prisma` for its Prisma models. All three sit at the feature root.
   Prisma is pointed at `src` and searches it recursively, so the models join
   the datamodel with no config edit. Then `yarn prisma:migrate` to create the
   tables.
3. Put pages in `routes/pages/` and REST handlers in `routes/api/v1/`. They
   mount themselves at `/<name>` and `/api/v1/<name>` — `src/routes.config.ts`
   discovers them. Restart `yarn dev` once after creating the directory.

   The feature owns its API versions: add `routes/api/v2/` and it serves at
   `/api/v2/<name>` alongside v1, with no config change.

### Removing one

`rm -rf src/features/<name>`. That is the whole procedure: routes, the navbar
entry, and the Prisma models are all discovered, so no config edit is needed.
Everything else — pages, REST endpoints, UI, service, navbar entry, Prisma
models, unit tests, and end-to-end specs — goes with the directory, because
tests are colocated rather than kept in a parallel tree.

The tables are the one thing that command does not remove. The models are gone,
so the next `yarn prisma:migrate` generates the `DROP TABLE` — an ordinary
migration in the shared history, because Prisma has no per-feature migration
history. Deleting a feature therefore leaves a migration pending.

### The boundaries are linted

`yarn lint` fails on an import that crosses them:

- `client/` and `shared/` may not import `server/` — server code cannot be
  bundled for the browser
- `server/` and `shared/` may not import `client/` — client code may touch
  browser globals and would throw on the server
- `app/` may not reach into a feature (only `AppNav` imports the registry)

Features may import each other; only the two rules above are enforced. They are
generic, so a new feature is covered the moment it exists — there is nothing to
register.

If something is needed by two features it still belongs in `app/`, which is why
the API key lives there. That is a design guideline, not a lint error.

## Requirements

- Node >= 26.8 (pinned in `.node-version`)
- Yarn 4, checked in under `.yarn/releases` (any `yarn` on the path runs it)

## Getting started

```bash
# optionally install corepack
npm i -g corepack
corepack enable
yarn

yarn prisma:generate
yarn prisma:migrate

# default: http://localhost:3000
yarn dev
```

`.env` is optional. Copy `.env.example` and adjust it to change ports, log
levels, or where the database and logs live. `DATA_DIR` and `LOGS_DIR` are only
used for local dev.

## Database

This app uses a SQLite database at `$DATA_DIR/app.db`. `DATA_DIR` defaults to
`./data` and can be changed in the `.env` file. The directory is created if
missing and checked for write access at startup.

## Docker

Production image only. Local development runs on the host.

```bash
# build image
./dev/build.sh

# run container with default paths
./dev/run.sh

# run container with custom data path
./dev/run.sh /mnt/appdata/db

# run container with custom data and logs paths
./dev/run.sh /mnt/appdata/db /mnt/appdata/logs

# stop container
./dev/down.sh
```

`run.sh` takes the database directory then the log directory. Both must already
exist. It waits on the image's `HEALTHCHECK` and fails if the container never
gets healthy. Extra arguments to `build.sh` reach `docker compose build`.

Or use compose directly, with the default `./data`:

```bash
docker compose up -d --wait
docker compose down
```

`compose.yaml` holds ports, limits, and hardening. The scripts are wrappers
around it, so change settings there.

The image runs as uid 1000, so both mounted directories must be writable by it.
On start it runs `prisma migrate deploy`, then the server.

Port and bind address come from the environment, and the settings page shows
them read-only with instructions rather than editing them. Compose resolves
`PORT` and `BIND_ADDR` from your shell, then `.env`, then its own defaults, and
interpolates the port into both the container environment and the published
mapping so the two cannot disagree. A published mapping is fixed when the
container is created, so nothing written inside the container can move it.

Log level is different: it is stored in the database, editable from the settings
page, and applies immediately. `LOG_LEVEL` in the environment overrides it and
makes the control read-only.

## Settings

`/settings` has two pages, both autosaving — there is no Save button anywhere.

**General** holds the instance name, the API key, the log level, and the backup
policy. It also displays the port, bind address, and data and log directories
**read-only**, with a line each saying which environment variable sets them:
nothing in a running process can move the listener, and under Docker the
published port mapping is fixed when the container is created.

**UI** holds the date and time formats — each option labelled in plain English
with a live example — plus theme and content width. Those last two are
remembered by the browser rather than stored on the server, so a phone and a
desktop can differ.

A change that cannot be saved blocks navigation until you either retry or
confirm you want to leave it behind.

## System

`/system` reports on the running instance rather than configuring it: version,
how long it has been up, the Node and platform it runs on, the data and logs
directories, the database size, and the latest applied migration.

`/system/backups` holds the backup policy — folder, interval, retention — the
list of archives with download and delete, a **Back up now** button, and
restore. It sits under System rather than Settings because the policy and the
controls that act on it belong on one page.

`/system/jobs` is two tables. The **schedule** lists every job with how often it
runs, when it last ran, when it runs next, and a **Run now** button. Below it,
the **history** is every run of every job — when it started, whether it
succeeded, how long it took, and the log entries that run produced — filterable
by job and by result, with the filters held in the URL so a view can be shared.

The scheduler wakes exactly when the next job is due rather than on a fixed
tick, so jobs can be scheduled minutes apart without polling.

A run started from the page takes the same lock a scheduled one does, so the two
cannot collide. If the server stops mid-run, that run is marked interrupted on
the next start and the job becomes due again — jobs are expected to be safe to
re-run from the beginning.

## Backups

Backups run on a schedule and can be taken on demand from `/settings/general`.
Each is one `.zip` holding the database and a manifest, written to the folder
named in the settings — relative paths resolve inside the data directory.

Backups can be downloaded or deleted from `/system/backups`; deleting asks
first, because there is no undo for a file.

Restore applies **in place, with no restart**, and accepts only an archive taken
by the running version; a mismatch is refused rather than repaired. The current
database is kept until the restored one has answered a query.

Downloads are served from `/backups/<name>` **without authentication**, because
this application has no user authentication at all — `/settings` is open and
shows the API key. Run it on a trusted network. The route sends no CORS headers,
so a page on another origin cannot read an archive.

## The REST API

All API routes (starting with `/api/v1`) require an API key and have CORS
enabled.

```bash
curl -H "X-Api-Key: $KEY" http://localhost:3000/api/v1/items
```

`/health` is unauthenticated so the Docker `HEALTHCHECK` can poll it.

## Tests

Tests live beside the code they cover: `*.test.ts` for Vitest units and
`*.spec.ts` for Playwright end-to-end specs, both under `src/`. A unit test
under a `client/` directory runs in Chromium; every other one runs in Node.
There is no separate `tests/` directory, and nothing test-related sits at the
repository root. The shared harness is in `src/app/testing/`.

```bash
# run unit tests
yarn test

# run unit tests in watch mode
yarn test:watch

# run e2e tests against local dev server
yarn test:e2e

# run e2e tests against production container
yarn test:e2e:docker

# run all checks that CI runs
yarn ci
```
