# Services

Reasoning behind the settings store, the API key, and the login. The rules are
in the root `AGENTS.md`; this is why they hold.

## Port and bind address

**Port and bind address are deployment settings, not application settings.**
They come from the environment — `PORT` and `HOST` — and nothing in the running
application can change them. The settings page displays both read-only,
alongside instructions for changing them, exactly as Grafana and Gitea do. A UI
that edited them would be writing a value it has no way to apply.

**That is a measurement, not a preference.** In `.output/server/index.mjs`, the
node preset reads `process.env` into `port` and `host` at module top level and
calls `serve({ port, hostname })` three lines later. `useNitroApp()` — where
Nitro plugins run — is invoked _after_ those reads, so a plugin is already too
late. Nitro's `serverEntry` is not a startup hook either: it is pushed into the
route table as a `/**` handler, so it runs per request. And `src/start.ts`
compiles to `_ssr/start-*.mjs`, reached only through `defineLazyEventHandler`,
deferred to the **first request**. The socket is bound before a single line
under `src/` has ever run. There is no seam.

**A shim that ran before the bundle was built here and removed.** `boot.ts` at
the repository root read `config.json` and filled `PORT`/`HOST`/`LOG_LEVEL` into
`process.env` before `await import`ing the server, and `dev/config-env.ts` let
`dev/run.sh` read the same file on the host to build the environment compose
starts from. Both are gone. The mechanism worked — it was verified against a
real container — but it existed only to make two deployment settings editable
from a web UI, and it cost a root file outside `src/`, a second config parser, a
four-level precedence rule in the launcher, and a trust boundary where the
container's own writes came back as untrusted input on the host. **Do not
reintroduce either file.** If the requirement returns, `network_mode: host` is
the mechanism to reach for rather than a shim; it is rejected below on its own
terms.

**Under Docker the port is compose's, start to finish.** `compose.yaml`
interpolates `${PORT:-3000}` into both the container environment and the
published mapping, so the internal port and the mapping derive from one value
and cannot desync. Compose resolves that value itself — shell environment, then
`.env`, then the default — which is why `dev/run.sh` deliberately does **not**
export `PORT` or `BIND_ADDR`: exporting them would shadow `.env` and reimplement
precedence compose already has. It reports the published mapping by asking
`docker port` afterwards rather than by guessing beforehand.

**A published port mapping is fixed at container creation**, so no setting
written inside a container can move it. That is the reason the port cannot be
UI-editable under Docker at all, and it is not something more code can fix.
`network_mode: host` would dissolve it — the app would bind the host interface
directly, no mapping to desync, and the port really would be editable from
inside. It is **rejected**: it gives up network isolation, which is a pillar of
this compose file beside `read_only`, `cap_drop: ALL`, and `no-new-privileges`;
it silently makes `ports:` inert, which a third party bringing their own compose
file would not be warned about; and it turns `HOST=0.0.0.0` from a safe default
into a LAN-exposed one. Verified on OrbStack that it does work on this platform,
both for `0.0.0.0` and loopback binds — so the rejection is a trade, not a
limitation.

## One store

**Every setting is a row in `Setting`, a singleton keyed `"app"` exactly as
`ApiKey` is.** There is no configuration file.
`src/app/server/services/settings.ts` owns it, validates its own input with
`updateSettingsSchema` from `@/app/shared/schemas/settings`. A write `upsert`s,
which is race-free, so it needs none of `apiKey.ts`'s create-then-catch
handling.

**A read is a `findUnique`, with the `upsert` only while the row is missing.**
It was an `upsert` with an empty update on every read — three `SELECT`s inside a
write transaction, measured at 164µs against 67µs for the plain read — and
`getSettings` is the hottest read in the app: the root loader calls it on every
document request and every `router.invalidate()`, so every mutation on every
page paid for a write.

A `config.json` beside the database was built and removed. It ended up holding
one value, the log level, on the argument that `createLogger` is synchronous and
cannot await a Prisma read. That is true of the _lookup_ and not of the _read_:
the level is read once into a module-level variable, and the logger consults the
variable. **Do not reintroduce a settings file** — the thing it bought was a
second answer to "which store does this setting go in", and that question is now
retired.

**Two fields are deliberately not settings and not rows.** Theme and layout
width are **per-browser**, because how much screen there is and which theme the
system uses are properties of the device, not the instance — a phone and a
desktop looking at one instance want different answers. Theme uses Mantine's own
colour-scheme store; layout width stays the cookie, for the reason "Layout"
already gives. `SettingsStyle` writes through the same paths `ThemeToggle` and
`WidthMenu` do, so it is a second consumer rather than a second mechanism, and
neither goes through autosave or navigation blocking.

## The API key

`/api/v1/*` is authenticated by a single API key: one key, stored locally,
regenerated from `/settings`. The `X-Api-Key` header is the **only** accepted
transport. Accepting the key as an `apikey` query parameter is common elsewhere
and deliberately not done here, because a key in a URL lands in access logs,
proxy logs, and `Referer` headers. An e2e case asserts the query parameter is
rejected, so adding it fails the suite rather than passing quietly.

**Every handler that reads or writes data goes through
`withApiRoute(request, fn)`**, which authenticates and then delegates to
`withErrorHandling`. It is one wrapper rather than two calls specifically so a
new handler cannot be written that error-handles but forgets to authenticate. Do
not call `withErrorHandling` directly from a route under `/api/v1`.

The one exception is each route's **`ANY` handler**, which Start reaches only
for a method the route does not define, and which returns `methodNotAllowed`
**unauthenticated**. 405 describes the resource, not the caller. Without it an
undefined method falls through to the router and answers 200 with the SSR
document, which an e2e case now pins. `HEAD` is not listed in `Allow` handling
because Start falls it back to `GET` and strips the body.

`src/app/server/services/apiKey.ts` owns the key. It is stored **in plaintext
and that is deliberate** — the settings page displays it for copy/paste, so it
cannot be hashed. Comparison is `timingSafeEqual`. `API_KEY` in the environment
overrides the stored row and makes regeneration throw.

**The key is read per request, never cached in memory**, so regenerating it
takes effect on the next request. An implementation that reads its key once at
startup has to tell you to restart before a new one applies. Immediate
revocation is the point: a key you cannot turn off until a restart is not really
revocable. Do not memoize `getApiKey` to save a query.

The `API_KEY` override is read per call too, and **not** for the reason the log
level is read in `createLogger` — do not make the two match. The environment is
fixed for the life of the process, so caching it would be correct; it is just
not worth anything. Measured: the `process.env` read is **211ns**, against
**51µs** for the `findUnique` on the next line — and that query is uncached on
purpose, per the rule above. Caching the read would spare 0.4% of the path and
keep the rest.

The cost of doing it anyway is what settles it. Nothing runs earlier than the
call that a test setting `API_KEY` could get ahead of, because the module is
imported first, so an import-time read means either a test-only reset export in
production code or rewriting the suite around `vi.resetModules` and dynamic
imports. Both buy 211ns.

**The key lives in the database, and a config file is not the alternative.**
Every setting does — see "One store" under Configuration. The original ruling
here, that a file was not worth "a format, a parser, and the same atomic-write
problem `archiveLogs` already solves once", was briefly overturned and then
vindicated: the file was built, reduced to one value, and deleted. `getApiKey`
runs inside a request, on a connection that already exists by the time any
handler runs, so a file would buy it nothing but a second place to read from and
a second value to keep in sync with `API_KEY`.

`/health` must stay unauthenticated — the Docker `HEALTHCHECK` polls it every
10s and cannot present a key. Do not wrap it.

## Login

**There is one account, and it lives on the `Setting` row** (`username`,
`passwordHash`). `settingsSchema` is a plain `z.object`, so a read strips both
and no page ever receives the hash. The hash is scrypt from `node:crypto`; no
dependency.

**`checkCredentials` takes the same time whichever half is wrong.** It runs
scrypt and compares the keys with `timingSafeEqual` before it looks at the
username, so a wrong username costs the same as a wrong password and the
response time does not reveal which one was right.

**Five failed logins within a minute close the login for everyone until the
oldest of them is a minute old.** A refused attempt never reaches scrypt, so a
flood cannot guess at scrypt speed or fill libuv's thread pool that file reads
and DNS lookups share. The count is global, not per IP: `X-Forwarded-For` is
never read (see `forms-except-local` below), so behind a reverse proxy every
request has one address and a per-IP count would be one count anyway, and a
direct attacker can rotate addresses. The cost is that a flood locks the owner
out of the login form while it lasts; an existing session is unaffected, and a
minute keeps the lockout short once the flood stops. A success does not count.
Each attempt is counted before its first `await` and uncounted if it succeeds,
so parallel attempts cannot all pass the check together. The timestamps live on
`globalThis`, as `prisma.ts` holds its client, so every bundle and a dev reload
share one count; a restart clears it.

**A session is a random token in an `HttpOnly`, `SameSite=Lax` cookie; the
database keeps only its SHA-256.** The database decides expiry (30 days, renewed
when a request arrives more than an hour after the last renewal, so a request is
not a write). Renewing on every request would turn every page load and every
server function into a write to SQLite's single writer; an hour is short enough
that an active session never comes near its 30 days. The cookie lives 400 days,
the browser cap, because it only has to outlive the row.

**`setupUser` is a conditional `updateMany`**, so two setup requests cannot both
create an account. The write matches only while `passwordHash` is null, and
SQLite applies one write at a time, so the second request matches no row and
gets "An account already exists". A read-then-write would let both pass the read
before either wrote. `RESET_AUTH=1` in the environment clears the account and
every session at startup; it runs before the `CI`/`TEST` guard in `startup.ts`,
because a locked-out operator may be running any build. Any other value does
nothing. **The reset runs on every boot while the variable is set**, so a
restart after it leaves the instance open at `/setup` to whoever reaches it
first. Each boot that resets prints a console warning and logs one, both telling
the operator to remove `RESET_AUTH`.

**`forms-except-local` trusts the socket peer only.** `X-Forwarded-For` is
whatever the client wrote, so it is never read. The socket peer is not always
the browser, though: behind a reverse proxy, or a Docker port forward that
rewrites the source address, every request arrives from a private address and
counts as local, so nobody logs in. Use `forms` ("Always") there; the setting's
description says so. Trusted proxies are out of scope for v1.

**With login, the API key is a boundary.** `/settings` is behind a session, and
so is every server function except `getShell`, `login`, `setup`, and `logout`.
`gate.ts` matches them by name and by `src/app/rpc.ts`, from `serverFnMeta`, so
a feature function named `login` is still guarded. `/setup` requested once an
account exists goes to `/login` with no `redirect`: after logging in, the client
would navigate to `/setup` without a document request, and the gate would never
see it.
