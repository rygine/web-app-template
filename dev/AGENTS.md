# Docker

Reasoning behind the Dockerfile, `compose.yaml`, and the scripts here that wrap
it. The rules are in the root `AGENTS.md`; this is why they hold.

Production-only: no dev target, no development tooling in any image.

Four stages: `base`, `build`, `prod-deps`, and `runtime`, which starts clean
from `node:26-slim`. `node_modules` in `runtime` exists for the Prisma CLI that
`CMD` runs, not for the server — `.output` is self-contained.

`CMD` calls the Prisma binary directly rather than `yarn prisma:migrate`: that
script is `migrate dev`, which is interactive, and `runtime` has no Yarn. The
`&&` keeps a failed migration from reaching the server. The `exec` is
load-bearing — it makes node the direct child of PID 1 so SIGTERM reaches it.

**The `build` stage runs `yarn build:image`, never `yarn build`.** `yarn build`
goes through `prisma:setup`, which runs `migrate dev` — against a database the
image then throws away. `DATA_DIR` is unset in that stage, so `databaseUrl`
falls back to `./data` and the migration lands at `/app/data/app.db`, while
`runtime` copies only `.output` out of `build`. Measured: 53KB of migrated
database created and discarded on every image build.

The waste is the smaller half. `migrate dev` authors a migration and prompts for
a name whenever the schema and the history disagree, and a non-TTY build has
nobody to answer — so any drift becomes a broken image build, for a step whose
output nothing reads. `build:image` is `prisma:generate && vite build`: generate
is genuinely required, since `vite build` compiles imports of
`@/generated/prisma/client`, and migrating is `CMD`'s job against the mounted
volume. This is also what makes the "host only, never a container" note on
`yarn prisma:migrate` true of the Dockerfile rather than merely aspirational.

**The install layers see only what an install reads.** `base` copies
`package.json`, `yarn.lock`, and `.yarnrc.yml` alone; `prisma.config.ts` and
`prisma/` were copied there too, so adding a migration reinstalled every
dependency in both the `build` and `prod-deps` stages. Both installs mount a
BuildKit cache at `/app/.yarn/cache` — `.yarnrc.yml` sets
`enableGlobalCache: false` and `.dockerignore` excludes the cache, so without it
each stage fetched the full set from the registry.

**`FROM node:26.8-slim` is pinned to the minor on purpose.** The job workers use
Node's experimental zip API and run unbundled on the image's own Node, so a
floating `node:26-slim` could change that API under a rebuild without any check
on the host noticing. See "Backup and restore" in
`src/app/server/jobs/AGENTS.md`.

## Shutdown

**Graceful shutdown is already handled, by `srvx` inside the server bundle** —
not by anything in `src/`. It hooks `SIGINT` and `SIGTERM`, stops accepting
connections, waits for in-flight requests, then force-closes. Do not add a
competing `process.on("SIGTERM")`; a clean exit code `0` on `docker stop` is
this working, not a signal being ignored.

Its timeout is **5s**, or `SERVER_SHUTDOWN_TIMEOUT`. `compose.yaml` allows
`stop_grace_period: 10s`, so srvx always finishes before Docker's SIGKILL. Those
two are ordered on purpose: raise the timeout past the grace period and Docker
kills the server mid-drain.

It is disabled when `CI` or `TEST` is set in the environment, which is why the
e2e suite's servers exit immediately rather than lingering.

Nothing calls `prisma.$disconnect()` on the way out. On SQLite that costs
nothing — every statement autocommits, and an unclean exit leaves a journal the
next open rolls back correctly.

**`compose.yaml` is the single definition of how the image runs** — ports,
hardening, limits, restart policy. The `dev/` scripts are thin wrappers around
it, so there is exactly one copy of those flags. Change runtime configuration
there, never by adding flags to a script.

The scripts exist for the one thing compose cannot do: take the storage location
as an argument. `./dev/run.sh /some/path` passes it as `DATA_PATH`, which
compose interpolates into the bind source.

`DATA_PATH` is a host path and only ever a host path, and it is deliberately not
called `DATA_DIR`: that name belongs to the container path the image declares,
and conflating the two was tried and reverted. **Keep it out of `.env` anyway**
— compose reads `.env` automatically, so a value there governs a bare
`docker compose up` while `dev/run.sh` ignores it. This paragraph previously
claimed the reverse, that `.env` would override the script's argument; measured,
a shell export beats `.env` in compose interpolation, so the argument wins
whenever the launcher is used. The hazard is two different data directories
depending on how you start it, not a silent override.

`dev/run.sh` uses `docker compose up --wait`, which polls the image's
`HEALTHCHECK` and exits non-zero if it never passes, including when `restart` is
looping the container. On failure the script dumps logs and runs `compose stop`
rather than `down`, so a crash loop cannot outlive it.

Easy to break, and none of it caught by lint, typecheck, or build — CI does not
build the image:

- `prisma.config.ts` imports `src/app/server/utils/database.ts`, so every stage
  loading that config needs the file. Move or rename it without updating the
  Dockerfile and the image breaks while host builds and CI stay green. `runtime`
  copies **named files, never a directory** — `src/app/server/utils/database.ts`
  and `src/app/schema.prisma`, and nothing else out of `src` — because the rest
  of `src/app/server` reaches Prisma and the runtime stage has no use for it.
  Adding an import to `prisma.config.ts` therefore means adding a `COPY`.
- `package.json` must be copied into `runtime`. Without it Node has no
  `"type": "module"` and treats `.output/server/index.mjs` as CommonJS.
- The image creates nothing at `/data` and declares no `VOLUME`. That pairing
  makes a wrong mount fail loudly. Add either and it instead succeeds quietly
  into an anonymous volume.
- Do not reintroduce `ARG DATA_DIR`. Storage location is a script argument,
  never a build argument — that was tried and reverted, because the same name
  then means a host path in `.env` and a container path in the image.
- **`compose.yaml` pins `DATA_DIR: /data` and `LOGS_DIR: /logs` in its
  `environment:` block, and that duplication of the Dockerfile's `ENV` is
  deliberate.** `env_file:` passes the whole of `.env` into the container, and
  both names are also real host-development settings, so `.env` would otherwise
  override the image and point the container at a relative path under `/app`,
  which is read-only. `environment:` outranks `env_file:`, which is what closes
  it. Anything the container must control belongs in that block rather than
  relying on the image's `ENV`.
- `NODE_ENV` in `.env` is **harmless**, for the same reason — `environment:`
  declares it and wins. An earlier note here claimed the opposite. Verify a
  change like this with `docker compose config` rather than reasoning about
  precedence.
- `build` runs `yarn build:image` after `COPY src ./src`, and that order is
  load-bearing twice over. `vite build` cannot resolve
  `@/generated/prisma/client` until `prisma:generate` has run, and the schema
  itself lives under `src`, so a generate ahead of the copy would find no
  datamodel at all rather than merely generating late.
- The image runs as `USER node` (uid 1000), so the mount must be writable by
  that uid.
- Yarn's version comes from `packageManager` — never hardcode it.
- `.gitignore` has no authority over the build context; only `.dockerignore`
  does. Treat gitignored as no signal about dockerignored.
- **`runtime` copies `src/app/schema.prisma` because it holds the `datasource`
  block, and deliberately not the feature schemas.** What `migrate deploy`
  requires from the schema is exactly that block and nothing else — measured, by
  running it against a schema holding a lone `datasource` (exit 0), a lone
  `generator` (exit 1, `Schema must contain a datasource block`), and an empty
  file (the same error). It needs the block because `prisma.config.ts` cannot
  supply a provider: its `Datasource` type is `url` and `shadowDatabaseUrl`
  only, so the schema is the sole place `provider = "sqlite"` is declared, and
  Prisma will not infer it from a `file:` URL.
  `prisma/migrations/migration_lock.toml` records the provider too, but Prisma
  reads it to detect a mismatch rather than to supply the value — otherwise this
  `COPY` would be unnecessary. The models are genuinely ignored:
  `migrate deploy` replays the `.sql` files and records them in
  `_prisma_migrations`, never diffing against the datamodel, which is the whole
  difference from `migrate dev`. A stripped datasource-only file would therefore
  also work, and is the wrong trade — a second copy of the datasource to keep in
  sync, for nothing. The alternatives are worse the other way:
  `COPY src/features/*/schema.prisma ./` collides, since every one of those
  files has the same name, and `COPY src ./src` drags client code into a stage
  that otherwise copies two named files out of `src` and nothing else. Both
  would also mean **adding a feature requires a Dockerfile edit**, which is this
  list's whole subject. The cost is that **bumping Prisma requires
  `yarn test:e2e:docker`**: a version that validated models at deploy time would
  break the image while CI stayed green, because CI does not build the image.
- **The runtime schema is for `migrate deploy` and nothing else.** `prisma` is a
  production dependency, so the whole CLI ships in the image, pointed at a
  datamodel that is missing every feature's models. Nothing is wired to a code
  path — `CMD` runs `migrate deploy` and stops there — but a command run by hand
  in that container is now silently wrong where it used to be harmless:
  `db push` sees only `ApiKey` and `Log` and treats `Item` as a table to drop,
  which it refuses without `--accept-data-loss` — noisy rather than safe;
  `db pull` rewrites `src/app/schema.prisma` from the live database; and
  `generate` emits an Item-less client. Run any of them on the host, against the
  full schema.
- **`runtime` must `COPY src/app/server/jobs/workers`.** Workers are forked as
  files at run time rather than bundled into `.output`, so a worker in a
  directory nobody copied fails only inside the container, while `yarn ci` stays
  green.
- **`vite.config.ts` registers the scheduler as a nitro plugin.** Dropping that
  entry leaves the build green and nothing ever scheduled; `startup.test.ts` is
  what catches it.
- **The `HEALTHCHECK` reads `PORT` from the container environment**, in a fresh
  `node -e` that shares nothing with the server process. It matches only because
  the server reads the same variable and nothing in between can change it —
  which is one of the things "Configuration" buys by keeping the listener
  environment-only. `ENV PORT=3000` is the fallback that makes an unset `PORT`
  consistent on both sides rather than splitting them.
- **`compose.yaml` passes `LOG_LEVEL: ${LOG_LEVEL:-}` deliberately, with no
  default value in the substitution.** A default there — `${LOG_LEVEL:-debug}`,
  say — would set the container's environment unconditionally, and the
  environment outranks the stored level; the setting would stop being editable
  from the settings page and no test would say why.
