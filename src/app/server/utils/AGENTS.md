# Server utilities

Reasoning behind `database.ts`, `prisma.ts`, `http.ts`, and the Prisma schema
layout. The rules are in the root `AGENTS.md`; this is why they hold.

## The HTTP wrappers and the error taxonomy

`src/app/server/utils/http.ts` holds `withApiRoute`, `withErrorHandling`,
`readJson`, and `methodNotAllowed`. **The API key is core, not a feature** — it
authenticates every feature's REST routes, so filing it as one made
`features/items` depend on `features/apiKey`, which is a feature depending on a
feature. Moving it into `app/` removed that edge and let `withApiRoute` fold
back in beside `withErrorHandling`, which is where the "one wrapper, never two
calls" rule below wants it.

**One taxonomy, two renderings.** `classify` in `src/app/server/utils/http.ts`
is the single branch table: `ZodError`, `BadRequestError`, `NotFoundError`, and
`UnauthorizedError` keep their message, and **anything else becomes "Something
went wrong." with the real error logged**. `withErrorHandling` renders it as a
REST response body; `toClientError` renders it as the error a browser receives
from a server function. A new kind of failure is added to `classify`, never to
one of the two renderers, and `classify` does the logging so both transports
report a failure identically.

**Server functions sanitise exactly as REST does, and that is not automatic.**
An exception escaping a server function is serialized to the browser as its
message, so a Prisma failure would ship column names and paths to anyone typing
in a form. `toClientError` is applied by a **function** middleware registered in
`src/start.ts`, which wraps each server function's validator and its handler, so
a new server function cannot be written that forgets it. `functionMiddleware` is
subject to the same rule as `requestMiddleware`: the array is the complete list,
never a supplement. A thrown `redirect` or `notFound` passes through untouched —
it is router control flow, not a failure.

**Only `ReportableError` may be shown to a user**, and it exists because an
Error crosses the server function wire as its message alone. Start's
`ShallowErrorPlugin` reconstructs every error as `new Error(message)`, so class
identity is gone and the client cannot tell a sentence written for a person from
`TypeError: Failed to fetch`. `reportableErrorAdapter` in
`src/app/shared/utils/errors.ts` is a `createSerializationAdapter` registered in
`serializationAdapters`, and it is what carries the identity across; it takes
precedence over the default because user adapters are tested first. Verified in
the client bundle and by the e2e case — a browser really does receive a
`ReportableError`.

**`failureMessage` composes the two halves**, in
`src/app/shared/utils/errors.ts`. A caller's message names the action that
failed — `"Could not create the item."`, with no advice attached — and the
reason is appended: a `ReportableError`'s message when there is one,
`"Please try again."` when there is not. Nothing else is repeated to a user,
because nothing else was written for one. A caller passing its own
`"Please try again."` would read it twice.

**It is a shared function rather than a step inside `useAsyncAction` because
there is a second caller that is not a hook.** `undoDelete` reports from module
scope, so it cannot reach the hook's `run`, and the message it wrote by hand
discarded the reason — the one failure path in the app that answered a
reportable rejection with generic advice. Any new place that catches and reports
goes through this rather than assembling a sentence of its own.

**A server function's `.validator()` takes `validate(schema)`, never the schema
itself.** Start feeds a Standard Schema straight into `execValidator`, which
turns a failure into `new Error(JSON.stringify(issues))` — the JSON array that
crossed the wire in the reported bug, and that no user can read. `validate` in
`src/app/shared/utils/validate.ts` wraps it as a function validator, which
throws the `ZodError` `classify` already maps, and keeps the caller's argument
type inferred from the schema. A REST route is unaffected: it parses in the
service.

**A schema message is therefore user-facing copy.** A validation failure reports
its **first** issue — one sentence naming one field to fix, where a joined list
is a wall of text and the second issue is still there on the next attempt — so
each message has to stand alone (`"Name must be 100 characters or fewer."`, not
`"Too big"`). The same text lands in a REST 400's `details`, so it is API
documentation too.

## The environment

`prisma.config.ts` loads the environment with **dotenv, not Node's
`process.loadEnvFile`**. The built-in takes a single path, has no override
option, and throws on a missing file, so it cannot express precedence across
several env files. Do not swap it for the built-in to drop the dependency.

It loads it with **`import "dotenv/config"`, which must stay the first import**.
`src/app/server/utils/database.ts` computes `databaseUrl` at module scope, and
ESM evaluates imports before the module body, so a `config()` call in the body
runs too late — `databaseUrl` is already fixed and `DATA_DIR` from `.env` is
silently ignored. That was a real bug: `yarn dev` honoured the directory in
`.env` while `yarn prisma:migrate` migrated `./data`, so the dev database never
received migrations. `import/no-unassigned-import` allows this one specifier.

`src/app/server/utils/database.test.ts` pins it: it points `DOTENV_CONFIG_PATH`
at a temporary `.env`, imports `~/prisma.config`, and asserts the resolved url.
Reordering the imports, or a formatter that sorts the side-effect import down,
fails it — verified by moving the import and watching it fail. **It lives beside
`database.ts` rather than beside the config it imports**, because the thing at
risk is `databaseUrl` being fixed at module scope here.

**`databaseUrl` and `dataDir` are constants, not functions, and converting them
to getters is not the fix for this.** That was tried and reverted. Load the
environment earlier instead. No test enforces this, so it is a review matter.

## The schema

**`prisma.config.ts` points `schema` at `src`, not at a file.** Prisma searches
that directory recursively for `*.prisma`, so a unit declares its own models
beside its own code:

| File                                | Holds                                      |
| ----------------------------------- | ------------------------------------------ |
| `src/app/schema.prisma`             | `generator`, `datasource`, `ApiKey`, `Log` |
| `src/features/<name>/schema.prisma` | that feature's models                      |

`prisma/` keeps only `migrations/`. Migration history is shared by construction
— the init migration already interleaves `ApiKey`, `logs`, and `Item` in one
file — so it is the one part of this that correctly stays outside `src/`.

**The file sits at the root of its unit, beside `rpc.ts` and `nav.ts`.** The
first level inside a unit is where the code runs, and a `.prisma` file runs
nowhere: it is a declaration consumed by the Prisma CLI at migrate and generate
time, gone before anything executes. It is a manifest declared to Prisma exactly
as `nav.ts` is a manifest declared to the shell, and `src/app/` already holds
both of those at its root, so the parallel is exact on both sides.
`server/schema.prisma` was considered — the generated client is server-only —
and rejected because the unit root gives the same file the same path shape in
`app/` and in a feature.

**`output` resolves against the file holding the `generator` block**, not
against the schema root. That is why `../generated/prisma` in
`src/app/schema.prisma` still lands at `src/generated/prisma`, and why no import
in `src/` changed when the schema moved.

**Any `.prisma` file anywhere under `src/` joins the datamodel.** Safe today
because the `prisma-client` generator emits only `.ts`, so `src/generated`
cannot re-ingest a copy of the datamodel and fail with duplicate models. It
stops being safe under the legacy `prisma-client-js` generator, or an `output`
path that receives a schema copy.

**Nothing guards the scan, and nothing needs to.** Breaking it is loud — the
generated client loses that model's delegate, the feature's service stops
compiling, and `yarn typecheck` fails. Contrast `src/app/nav.ts`, where an empty
glob renders a perfectly fine empty navbar and needs `items.spec.ts` to catch
it.

**Two layouts were tried and rejected.** One file per feature under
`prisma/schema/` makes deleting a feature two paths instead of one, which is the
problem this solves. Symlinking `prisma/schema/<name>.prisma` at the feature's
file works — Prisma follows symlinks inside the schema folder — but leaves a
dangling link behind on delete, so it fails the same test.

## WAL

The database runs in WAL, set by the first line of the init migration. Journal
mode is stored in the file header, so a migration pins it for every connection
that ever opens the file and nothing has to run at startup. Measured: 399µs to
75µs per insert.

`synchronous` is left where WAL puts it, which is `NORMAL` — SQLite lowers it
from `FULL` on its own for a WAL database. That is the deliberate choice here
and it is what keeps `src/app/server/utils/prisma.ts` free of a startup
`PRAGMA`: `synchronous` is per connection and no migration can pin it, so `FULL`
would mean executing a statement on every client. The trade is that a **power
loss or OS crash** can lose the last committed transactions. A process crash
cannot, and neither corrupts the file.

WAL also means `app.db` is no longer the whole database. A backup has to take
`app.db-wal` and `app.db-shm` with it, or checkpoint first; copying the one file
can miss committed transactions.

## `prisma.ts` must not log

**`src/app/server/utils/prisma.ts` must not log.** The handler writes through
the Prisma client, so a logger there would be circular — and it would be writing
through a client that does not exist yet, since that file is what creates it.
This is the one rule holding the direction open.

Writing through Prisma means one connection for logs and app data, so log writes
cannot contend with app writes for SQLite's single writer, and the `logs` table
is typed like every other. The cost is that **writes are asynchronous while
`log.info` is not**, and everything else follows from how that is resolved:

## The request middleware

`src/start.ts` is the Start entry, auto-discovered by the Vite plugin from that
path. **Its `API_PREFIX` is `/api/`, not `/api/v1`**, so CORS and request
tracing cover every API version a feature mounts. Pinning it to one version was
the original shape and would have left a `/api/v2` route silently without CORS
headers or a request id while still being authenticated. It registers one
**request** middleware, which runs for every request the server handles — REST
routes, server functions under `/_serverFn/*`, and SSR document requests alike.
It is the only place either of the two things below can be done once rather than
per route. It registers one **function** middleware beside it — the server
function error boundary, described under Errors above.

**The request id.** Taken from an inbound `X-Request-Id` when present so an id
assigned by a proxy survives, generated otherwise, put on the Start context, and
echoed on the response. `src/app/server/log/logger.ts` reads it back and writes
it to the `requestId` column, so every record emitted while serving one request
shares it and `queryLogs({ requestId })` retrieves them together. Correlation
was the point: filtering by namespace and message substring cannot reassemble a
request.

`getGlobalStartContext()` **throws** outside a request, and again if called
before the global middlewares run — its type says `| undefined`, and that is
wrong. `currentRequestId` catches both, because module scope emits records and a
future scheduled task would too. Do not replace it with a bare optional chain;
the unit suite fails immediately if you do, which is how this was found.

**The middleware traces the request itself**, at `trace`, once on the way in and
once on the way out with the status and elapsed milliseconds. It is what gives
`queryLogs({ requestId })` something to find for a request that never reached a
service — one rejected at CSRF, at CORS, or answered with a 405.

It is scoped to `isDataRequest`: `/api/` and `/_serverFn`. **`/health` is
excluded for the same reason `src/routes/health.ts` does not log** — the Docker
`HEALTHCHECK` probes it every 10s. SSR documents and assets are excluded because
one navigation would otherwise write a row per asset.

**Both records pass `requestId` in their fields, and that is not decoration.**
The middleware runs _outside_ the context it establishes, so `currentRequestId`
returns null for its own two records — measured, not assumed: they landed with a
null column while every record beneath them in the same request had one, which
made the anchor the one thing the correlation query could not retrieve.
`prismaLogHandler` falls back to a `requestId` field when the ambient lookup
finds nothing, and a unit case pins it. Everywhere else, the ambient lookup is
the mechanism and passing the field by hand is redundant.

**CORS**, wildcard, and scoped to `/api/` only — every version, nothing else.
Preflight is answered with 204 before routing and **before any key check** —
browsers never send `X-Api-Key` on a preflight, so authenticating it would make
the API uncallable from a browser. `Access-Control-Expose-Headers` carries
`X-Request-Id`, without which a browser client cannot read the correlation id
back.

The wildcard is safe **because the API carries no ambient credentials** — no
**authenticating** cookies, no session — so a page cannot forge a call it could
not already make with `curl`; it still needs the key.
`Access-Control-Allow-Credentials` is deliberately absent and is incompatible
with `*` anyway. Adding cookie or session auth invalidates this reasoning and
means restricting origins first. The layout-width cookie is the one cookie the
app sets; it carries no authority and is `SameSite=Lax`, so a cross-site `fetch`
to `/api/v1` does not send it and the reasoning above is unaffected.

**Keeping it the only cookie is a live constraint**, and the next preference is
where it quietly stops being true: preferences accumulate and a cookie is the
reflex. Reach for `localStorage` unless the value has to be read server-side
before first paint, which is the one thing it cannot do and the only reason the
layout width is a cookie.

**The `/api/` scope is load-bearing, not tidiness.** `/settings` is
unauthenticated and displays the key; giving it CORS headers would let any page
read the key cross-origin. An e2e case asserts it has none.

**`csrfMiddleware` must stay in `requestMiddleware`, and this is the sharpest
trap in the file.** Start installs CSRF protection on server functions itself,
but only while no start instance exists —
`requestMiddleware: hasStartInstance ? startOptions.requestMiddleware : [defaultCsrfMiddleware]`.
Declaring the array **replaces** that default rather than adding to it. Server
functions take no API key, so without it any site the user visits can create,
update, and delete through `/_serverFn/*`.

This is not hypothetical: adding `src/start.ts` for the request id silently
removed it, and forged writes carrying `Origin: http://evil.test`, no `Origin`
at all, and `Sec-Fetch-Site: cross-site` all landed rows before it was put back.
Start warns about the missing middleware, but only outside production — and
`yarn ci` runs the production build, so nothing said a word. An e2e case now
captures a real create and replays it cross-site, expecting 403.

Anything else added to `requestMiddleware` keeps the same obligation: the array
is the complete list, never a supplement.
