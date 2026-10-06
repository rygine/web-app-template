# AGENTS.md

Instructions for agents working in this project. This file holds only what
applies everywhere. The rules and reasoning for each area — what was tried, what
was measured — live in an `AGENTS.md` beside the code, loaded when you work in
that directory. **Read the one for the area you are changing.**

| Directory                    | Covers                                                 |
| ---------------------------- | ------------------------------------------------------ |
| `src/app/`                   | the app name, verification, layout, lint, React rules  |
| `src/app/server/log/`        | logging, the log level, archiving                      |
| `src/app/server/jobs/`       | the scheduler, the lock, workers, backup and restore   |
| `src/app/server/utils/`      | database, schema layout, WAL, the error taxonomy       |
| `src/app/server/services/`   | the settings store, the API key, port and bind address |
| `src/app/client/layouts/`    | shell geometry, scrolling, the drawer, the panel       |
| `src/app/client/components/` | nav, toasts, theme and width controls, Mantine detail  |
| `src/app/client/hooks/`      | autosave, `useAsyncAction`                             |
| `src/app/testing/`           | the harness and every trap the suite has hit           |
| `src/features/`              | what a feature is, discovery, deleting one             |
| `src/features/items/`        | the worked example                                     |
| `src/routes/`                | `/settings`, `/system`, `/backups`, `/health`          |
| `dev/`                       | the Dockerfile, `compose.yaml`, and the scripts        |

**Reasoning goes in one of those files, never in a code comment.** Comments are
one line and informational.

## The project

TanStack Start on Node 26 with Yarn 4, TypeScript 7 (`strict`, ESM only), Prisma
7 on SQLite, Mantine, oxlint, oxfmt, Vitest, Playwright, Docker. The `Item`
domain is a **worked example, not a feature** — it shows the wiring end to end
and is meant to be deleted; do not grow it. The project name lives only in
`package.json` and reaches `src/` through a `define`, so the navbar renders the
package name as-is; the database is `app.db`.

Scripts are in `package.json`; the ones with a catch: `yarn prisma:migrate` is
`migrate dev` and runs on the host only, never in a container;
`yarn build:image` is the Dockerfile's build and skips it; `yarn ci` reproduces
the whole CI gate; `yarn test:e2e:docker` runs the e2e suite against the real
image; `yarn clean` leaves `data/` alone.

## Rules that hold everywhere

- **Declaring a list replaces a default; it never supplements it.** True of
  `requestMiddleware`, `functionMiddleware`, `virtualRouteConfig`, logger
  handlers, and lint overrides alike — the array is the complete list.
- **`csrfMiddleware` must stay in `requestMiddleware` in `src/start.ts`.**
  Declaring the array removed Start's default and forged cross-site writes
  landed; Start warns only outside production. The same file registers the
  function middleware that sanitises every server function's errors, and
  `API_PREFIX` is `/api/` so CORS and tracing cover every API version.
- **CORS is wildcard on `/api/` only, and only because the API carries no
  ambient credentials.** The layout-width cookie is the app's only cookie.
  Adding session or cookie auth means restricting origins first; a new
  preference goes to `localStorage` unless it must be read before first paint.
- **The API key identifies callers; it is not a security boundary.** `/settings`
  shows it and server functions take none. Every REST data handler goes through
  `withApiRoute`; `X-Api-Key` is the only transport; the key is read per
  request, never cached. `/health` stays unauthenticated and never logs.
- **The UI calls server functions; REST is the external surface.** Both go
  through the feature's service, which validates with Zod. No hand-rolled fetch
  client, no Prisma from a route handler, no `node:sqlite` in the server
  process. A server function's `.validator()` takes `validate(schema)`, and a
  schema message is user-facing copy.
- **One error taxonomy**: add a failure kind to `classify`, never to a renderer.
  Only `ReportableError` reaches a user; report through `failureMessage`.
- **Every setting is a `Setting` row; there is no config file.** `PORT` and
  `HOST` are environment-only and nothing in the app can change them. Theme and
  layout width are per-browser, not settings.
- **Nothing may log at module scope**, and `src/app/server/utils/prisma.ts`,
  `database.ts`, `archiveLogs`, and `health.ts` may not log at all. Log writes
  are fired and never awaited; do not add ordering or a flush.
- **Never keep mutable job state in a module-level variable** — the bundle
  splits the registry in two. A job must be safe to re-run from the beginning. A
  worker imports nothing from `src/`, takes its payload on `argv` never IPC, and
  is copied into the image, not bundled.
- **Never use `useEffect`.** Reset derived state by remounting on a key. If a
  case seems to need one, stop and ask.
- **Nothing rendered on the server may depend on the color scheme, the ambient
  locale, or the timezone.** Render both variants and hide one in CSS, or put
  the route under `ssr: "data-only"`; never `suppressHydrationWarning`.
- **Never add a barrel, and never name a file `index.ts`/`index.tsx` outside a
  routes directory.** Every import names the module that owns the symbol.
- **No `../` imports.** `@/*` is `src/`, `~/*` is the repository root,
  `./sibling` is fine. Root config files keep `./`.
- **Style props for everything except a `var()` value, positioning, and size**,
  which are CSS in the module beside the component. `Group`/`Stack`, not `Flex`.
  Phosphor icons imported one per module path, never from the root.
- **Tests are colocated in `src/`**: Vitest `*.test.ts` (Chromium under
  `client/`, Node elsewhere), Playwright `*.spec.ts`, never inside a mounted
  routes directory. The e2e suite is serial on one never-emptied database —
  assert deltas, never literal totals, and any accessible name built from data
  needs `exact: true`.
- **Add dependencies at the latest version via `yarn add`**; never hand-write a
  range, never `npm`/`pnpm`.
- **Only syntax that erases to nothing**: annotations, `type`, generics,
  `import type`, `as const`, `satisfies`. Never `enum`, `readonly`,
  `private`/`protected`/`public`, `abstract`, `override`, `declare`,
  `namespace`, parameter properties, or decorators; a hidden member is
  `#private`. A `.d.ts` is exempt.
- **A vocabulary is an `as const` array or object, and only when something
  iterates it at run time.** A value that is only compared against is written as
  its literal where it is used.
- `erasableSyntaxOnly` is on; `T[]` not `Array<T>`; `const fn = () => {}`;
  braces on every control-flow body; components are PascalCase arrow functions.
  `.output/`, `src/generated`, and `src/routeTree.gen.ts` are generated — never
  commit or hand-edit them.

## Source layout

`src/app` is **core** — what belongs to no single feature. `src/features/<name>`
is **pluggable** — one slice, added and removed as a unit. `src/routes` keeps
only app-level routes. The first level inside a unit is where the code runs, the
level below is what it is; create a subdirectory only when needed.

```text
src/
  app/
    client/   components/ contexts/ hooks/ layouts/ utils/
    server/   jobs/ log/ services/ utils/
    shared/   schemas/ utils/
    rpc.ts  nav.ts  schema.prisma  testing/
  features/<name>/
    rpc.ts  nav.ts  schema.prisma  <name>.spec.ts  routes.test.ts
    client/  server/  shared/
    routes/pages/   mounted at /<name>
    routes/api/v1/  mounted at /api/v1/<name>
  routes/  router.tsx  start.ts  routes.config.ts
```

`client` ships to the browser (and still renders during SSR), `server` never
does, `shared` is safe in both. A unit's root holds `rpc.ts` (the
`createServerFn` surface and nothing else), `nav.ts`, and `schema.prisma`.
Routes are nested directories, never dot notation; a layout route is
`route.tsx`. Routes, nav entries, and models are all **discovered**, so deleting
a feature is `rm -rf src/features/<name>` — but the e2e harness and app-level
specs use `/items` as their subject, so grep `src/app/*.spec.ts` before
reshaping it.

**The dependency runs one way: `features → app`.** `app` imports no feature
except through the nav glob in `src/app/nav.ts`. Enforced by
`no-restricted-imports` in `oxlint.config.ts` — TypeScript because oxlint cannot
pin a rule globally, so `restrictImports(...)` spreads the shared `paths` into
every override; an override that lists only `patterns` silently drops the
`useEffect` ban.

| from → to | `client` | `shared` | `server` |
| --------- | -------- | -------- | -------- |
| `client`  | ok       | ok       | **no**   |
| `shared`  | **no**   | ok       | **no**   |
| `server`  | **no**   | ok       | ok       |

`client`, `shared`, every `nav.ts`, and `src/router.tsx` also may not import a
Node built-in at run time; a type import is fine.

## Verification

Run `yarn ci` and report its actual output before claiming work is complete. Its
order is load-bearing: generate before build, build before lint and typecheck
(the route tree is generated by the build), `yarn format` before `format:check`
(oxfmt sorts imports and wraps Markdown prose; never hand-wrap). CI does not
build the image — Dockerfile and compose changes are verified only by
`yarn test:e2e:docker`.

## Docs

Generated documents go in `docs/`, which is gitignored on purpose. Do not
un-ignore, force-add, or relocate it; say which files you wrote there.

## Commits

**Do not make commits unless the user specifically asks, and do not offer to.**
No staging, no `git push`, branches, PRs, or tags. Finish the work, say what
changed, and stop.
