# App-level routes

Reasoning behind `/settings`, `/system`, `/backups`, and `/health`. The rules
are in the root `AGENTS.md`; this is why they hold.

## The settings routes

`src/routes/settings/` is a directory: `route.tsx` (layout, one loader for
settings, the API key, and the runtime report), `index.tsx` (redirect to
`general` with **`replace: true`**), `general.tsx`, `ui.tsx`. Both pages read
the layout's data back with `getRouteApi("/settings")`, which is the `/items`
pattern.

**It carries `ssr: "data-only"`**, and for the same class of reason `/items`
does: the theme control shows the viewer's stored colour-scheme preference,
which lives in `localStorage` and is unknowable on the server, so rendering it
during SSR is a guaranteed hydration mismatch.

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

**It carries `ssr: "data-only"`** for the same reason `/items` and `/settings`
do: uptime is rendered relative to the viewer's clock and every timestamp
against their locale, neither of which the server can know.

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
reload and a shared link; `page`, `size`, `job`, and `status` behave exactly as
they do on `/items`, down to the bounded `JOB_RUN_PAGE_SIZES` and the single
`.catch()` around the whole schema. **No per-field catch**, for the reason the
items schema gives: a malformed param resets the lot rather than being quietly
repaired one field at a time.

**Both tables can contain the word "succeeded"**, since the schedule's Last run
column reports it too. A test that wants a history row has to scope by something
only history has — the per-run logs control — which is how the first version of
that case went wrong.

**Opening a run's logs can legitimately show nothing, and the empty state says
so.** `archiveLogs` drains the log table, so records age out into archive files
— and the archive job drains the records of its own run, which is why an e2e
case that targeted it was flaky and now targets `backup` instead.

## Downloading a backup

**`/backups/$name` is unauthenticated and deliberately not under `/api/`.**

Unauthenticated because this application has no user authentication at all:
`/settings` is open and displays the API key, so a key check there would protect
nothing already unreachable — and a plain `<a download>` cannot send a header
anyway. The service assumes a trusted network, which is stated in the README.

**Outside `/api/` because that prefix carries wildcard CORS.** An
unauthenticated download there would let any page the operator visits read the
entire database cross-origin, which turns "trusted network" into "trusted
browsing". An e2e case asserts the route sends no CORS header.

**Restore is a server function rather than a route, for the mirrored reason.**
It replaces the whole database, and server functions carry `csrfMiddleware`; an
unauthenticated `POST` route would let any site the operator visits overwrite
their data.

**The name is matched against a pattern and the resolved path is re-checked
against its directory.** Traversal is the risk this route actually carries,
authentication aside, and an e2e case drives three encodings at it.

## Health

`/health` must stay unauthenticated and must not log — the Docker `HEALTHCHECK`
probes it every 10s and cannot present a key. The request middleware excludes it
from tracing for the same reason.
