# App-level routes

Reasoning behind `/settings`, `/system`, `/backups`, and `/health`. The rules
are in the root `AGENTS.md`; this is why they hold.

## The settings routes

`src/routes/settings/` is a directory: `route.tsx` (layout, one loader for
settings, the API key, and the runtime report), `index.tsx` (redirect to
`general` with **`replace: true`**), and one file per core section. A feature's
settings pages live in its own `routes/settings/` and mount at
`/settings/<name>`. A page that needs the layout's data reads it back with
`getRouteApi("/settings")`.

**Each page has one loader, one server function.** A server function is an HTTP
request of its own, and the settings page reloads on every autosave.

**It carries `ssr: "data-only"`**: the theme control shows the viewer's stored
colour-scheme preference, which lives in `localStorage` and is unknowable on the
server, so rendering it during SSR is a guaranteed hydration mismatch.

**`RuntimeView` lives in `@/app/shared/schemas/runtime`, not beside its
reader.** The reader is server-only and the type is rendered by the client; a
client file importing it from `server/` is caught by `no-restricted-imports`
even as a type-only import, because the rule matches the specifier. That was
found by writing it.

**`getShell` replaced `getLayout`** and carries the layout width, the resolved
instance name, and the date formats — everything chrome outside `/settings`
renders. It is the first thing to make the root loader touch the database: one
singleton read per document request.

## The system section

`/system` reports on the running instance and never configures it. `route.tsx`
is a layout with one loader; `index.tsx` is the status page and `jobs.tsx` is
the job list.

**It carries `ssr: "data-only"`**, as `/items` and `/settings` do: uptime is
rendered relative to the viewer's clock and every timestamp against their
locale, neither of which the server can know.

**Uptime crosses the wire as a start time, not a duration.** `getSystemInfo`
returns `Date.now() - process.uptime() * 1000`, and the page formats it
relative. A duration would be wrong the moment it was serialized, and would need
a ticker to stay right.

**`SystemView` lives in `@/app/shared/schemas/system`** rather than beside its
reader, for the reason `RuntimeView` does: a client file may not import from
`server/`, and `no-restricted-imports` matches the specifier even on a type-only
import.

**Each job renders as a labelled `role="group"`.** Every job has an identical
"Run now" button, so without a grouping the only way to address one in a test is
by position. The label is the job's `title`.

**The page is two tables, and the split is the point.** The top one is the
**schedule** — every registered job with its frequency, last run, next run, and
a Run now button — and it answers "what is set up". The bottom one is the
**history**: every run of every job, one table rather than one per job, and it
answers "what actually happened".

**The history reuses the items list's mechanics rather than inventing its own.**
Filters are validated search params (`jobRunSearchSchema`), so they survive a
reload and a shared link; `page` and `size` behave exactly as they do on
`/items`, down to the bounded `JOB_RUN_PAGE_SIZES` and the single `.catch()`
around the whole schema. **No per-field catch**: a malformed param resets the
lot rather than being quietly repaired one field at a time.

**Both tables can contain the word "succeeded"**, since the schedule's Last run
column reports it too. A test that wants a history row has to scope by something
only history has — the per-run logs control — which is how the first version of
that case went wrong.

**Opening a run's logs can legitimately show nothing, and the empty state says
so.** `archiveLogs` drains the log table, so records age out into archive files
— and the archive job drains the records of its own run, which is why an e2e
case that targeted it was flaky and now targets `backup` instead.

## Downloading a backup

**`/backups/$name` needs a session, like every page, and is deliberately not
under `/api/`.** `authGate` treats it as a document, so a plain `<a download>`
works: the browser sends the session cookie, where it could not send an
`X-Api-Key` header.

**Outside `/api/` because that prefix carries wildcard CORS and ignores the
session.** There the download would need the key, which a link cannot send. An
e2e case asserts the route sends no CORS header.

**Restore is a server function rather than a route.** It replaces the whole
database, and server functions carry `csrfMiddleware` and `serverFnAuth`, so a
site the operator visits cannot overwrite their data.

**The name is matched against a pattern and the resolved path is re-checked
against its directory.** Traversal is the risk this route actually carries,
authentication aside, and an e2e case drives three encodings at it.

## The login

**An ended session sends a loader to `/login` with a redirect, not an error.**
`serverFnAuth` throws `redirect({ to: "/login" })` when the server function's
`method` is `GET` (a loader) and `UnauthorizedError` for `POST`, whose callers
show the message in a toast. It works because `toClientError` passes a redirect
through `serverFnErrors` untouched and the client stub rethrows a parsed
redirect into the router. `method` is on the function middleware's server
options, so no `ErrorPage` fallback was needed; `auth.spec.ts` covers it. **A
`GET` server function is for loaders only, by convention**: called without a
session it redirects, which a toast cannot show. Anything a user action calls is
`POST`.

## Health

`/health` must stay unauthenticated and must not log — the Docker `HEALTHCHECK`
probes it every 10s and cannot present a key. The request middleware excludes it
from tracing for the same reason.
