# Core conventions

The stack, the scripts, and the reasoning behind the layout, lint, and
formatting rules in the root `AGENTS.md`.

## The app name

The project name does not appear in `src/` at all. `src/app/shared/utils/app.ts`
exports `APP_NAME` and `APP_VERSION`, both injected from `package.json` by a
`define` in `vite.config.ts` and `vitest.config.ts`, and both feed the document
title and the navbar. Renaming the app is therefore the `name` field and nothing
under `src/`. The database is `app.db`. The remaining occurrences are listed in
the README's "Make it yours" table.

`define` substitutes identifier references and is skipped wherever a local
binding shadows the name, so the injected globals carry the `__NAME__` sigil. A
bare `APP_VERSION` would be shadowed by the export on the very next line and
compile to `const APP_VERSION = APP_VERSION` — a TDZ error at runtime, with no
build error. `no-underscore-dangle` allows exactly these two names.

**The navbar and title therefore render the package name, kebab-case and all.**
That is the trade for having one source: a display name with spaces or capitals
needs a separate field in `package.json` to read from, not a literal back in
`src/app/shared/utils/app.ts`.

## Stack

| Concern         | Tool                                                 |
| --------------- | ---------------------------------------------------- |
| Runtime         | Node >= 26.8 (pinned in `.node-version`)             |
| Package manager | Yarn 4 (Corepack, `nodeLinker: node-modules`)        |
| Language        | TypeScript 7, `strict`, ESM only                     |
| Framework       | TanStack Start                                       |
| Router          | TanStack Router (file-based, mounted per feature)    |
| Bundler         | Vite                                                 |
| Database        | Prisma 7 + SQLite (`@prisma/adapter-better-sqlite3`) |
| UI              | Mantine                                              |
| Lint            | oxlint                                               |
| Format          | oxfmt                                                |
| Unit tests      | Vitest                                               |
| E2E tests       | Playwright (chromium)                                |
| CI              | GitHub Actions (`.github/workflows/checks.yml`)      |
| Container       | Docker (`Dockerfile` + `compose.yaml`)               |

## Commands

| Script                 | What it does                                        |
| ---------------------- | --------------------------------------------------- |
| `yarn dev`             | Vite dev server on port 3000                        |
| `yarn build`           | Production build to `.output/`                      |
| `yarn build:image`     | The build the Dockerfile runs — no `migrate dev`    |
| `yarn start`           | Run the production build                            |
| `yarn prisma:generate` | Generate the Prisma client into `src/generated`     |
| `yarn prisma:migrate`  | `prisma migrate dev` — host only, never a container |
| `yarn typecheck`       | `tsc` with `noEmit`                                 |
| `yarn lint` / `fix`    | oxlint, optionally with `--fix`                     |
| `yarn format`          | oxfmt, writes in place                              |
| `yarn format:check`    | oxfmt, fails on unformatted files                   |
| `yarn ci`              | Everything CI runs, in one command                  |
| `yarn test`            | Vitest unit tests, one run                          |
| `yarn test:watch`      | Vitest in watch mode                                |
| `yarn test:e2e`        | Playwright end-to-end tests                         |
| `yarn test:e2e:docker` | Same suite against the production container         |
| `yarn clean`           | Remove `node_modules`, `.tmp/`, and build output    |
| `yarn clean:build`     | Remove build output only                            |

`yarn clean` leaves `data/` alone — it is the local database. It removes
`.tmp/`, which is only ever test databases.

## Verification

Run `yarn ci` and report its actual output before claiming work is complete. It
reproduces the whole CI gate.

Ordering inside it is load-bearing:

- There is no `postinstall`, so `src/generated` only exists once
  `yarn prisma:generate` has run.
- `build` must precede `lint` and `typecheck`: the tanstackStart Vite plugin
  generates the gitignored `src/routeTree.gen.ts` during `vite build`, so route
  types resolve against nothing until a build has run. `yarn build` does not
  typecheck.
- Run `yarn format` before `yarn format:check` — oxfmt also sorts imports and
  `package.json` keys and formats Markdown, so hand-written files frequently
  fail the check on first pass.

oxfmt formats Markdown structure — heading style, list markers, blank lines, and
code inside fences — **and prose width too**, because `.oxfmtrc.json` sets
`proseWrap: "always"`. oxfmt's own default is `"preserve"`, since
linebreak-sensitive renderers exist; setting it is what makes the 80-column
wrapping in the Markdown here enforced rather than a hand convention, so an
over-length paragraph fails `format:check` instead of passing quietly.

**Tables and fenced code are exempt**, which is oxfmt's behaviour rather than a
rule here — the Styling table below runs past 140 characters and passes. So do
not hand-wrap a table, and do not hand-wrap prose either: write the paragraph
and let `yarn format` place the breaks, which is the other reason it runs before
`format:check`.

oxfmt honours `.gitignore` on top of `ignorePatterns`, so a probe file written
under `.tmp/` is skipped silently and looks like "oxfmt does nothing."

`yarn test:e2e` alone runs the Vite dev server; under `CI=1` it runs the
production build, so a bare pass does not guarantee a CI pass.

## Conventions

Formatting is enforced by `.oxfmtrc.json` — match it rather than reformatting by
taste. `oxlint.config.ts` runs `correctness` and `suspicious` at error with
`typeAware` on, so far more is enforced than the explicit `"rules"` list.
`yarn lint` is the source of truth.

- ESM only. Use `import`/`export`, never `require`.
- `erasableSyntaxOnly` is on, because job workers are run by Node's type
  stripping. Non-erasable syntax — an `enum`, a parameter property — would fail
  in a forked worker at run time rather than at build.
- Every control-flow body has braces. `curly: all` enforces it and `yarn fix`
  adds them.
- Array types are `T[]`, never `Array<T>`. `typescript/array-type` enforces it
  and fixes it with `yarn fix`.
- Define functions as `const fn = () => {}`, not `function fn() {}`.
- New top-level source directories must be added to `tsconfig.json`'s `include`
  or they will not be typechecked.
- Comments are one line and informational. Reasoning belongs here, not inline.
- `.output/`, `src/generated`, and `src/routeTree.gen.ts` are generated and
  gitignored. Do not commit or hand-edit them.

## Source layout

`src/` has two ideas in it, plus what the framework owns.

- **`src/app`** is **core** — everything the application needs to function that
  belongs to no single feature: the shell, the router entry's layout, the Prisma
  client, the logger, the HTTP wrappers, the error taxonomy.
- **`src/features/<name>`** is **pluggable** — one slice, self-contained, added
  and removed as a unit.
- **`src/routes`** keeps only what is genuinely app-level: `__root.tsx`, the
  index redirect, `health.ts`, and `settings.tsx`. Every other route lives in
  its feature.

Inside `app/` and inside each feature, the first level is **where the code
runs** — `client/`, `server/`, `shared/` — and the level below is **what it is**
— `components/`, `contexts/`, `hooks/`, `layouts/`, `services/`, `schemas/`,
`utils/`, `log/`.

```text
src/
  app/
    client/   components/ contexts/ hooks/ layouts/ utils/
              layouts/ is the shell; anything rendered inside it
              is a component
    server/   log/ services/ utils/
    shared/   schemas/ utils/
    rpc.ts                          server functions — getShell, getKey,
                                    regenerateKey, getSettings,
                                    updateSettings, getRuntime
    nav.ts                          the app's own nav entries
    schema.prisma                   generator, datasource, ApiKey, Log,
                                    Setting
  features/
    items/
      rpc.ts                        server functions — list get create
                                    update remove
      nav.ts                        manifest — how it appears in the shell
      schema.prisma                 model Item
      client/components/            ItemList ItemRow ItemTime NewItemRow
                                    UndoToast
      client/hooks/useDeleteItem.tsx
      server/services/items.ts
      shared/schemas/items.ts
      routes/pages/                 mounted at /items
      routes/api/                   mounted at /api/v1/items
  routes/   generated/   router.tsx   start.ts   routes.config.ts
```

`client` / `server` / `shared` are **literal**. `client` means "ships to the
browser bundle" — not "runs only in the browser", since every component also
renders during SSR. `server` never reaches the browser. `shared` is safe in
both.

**The subdirectories are created only when needed.** A client-only feature has
just `client/`; nothing requires the full triad, and an absent directory is the
intended state rather than an omission to correct.

**The test for a feature is whether another feature could depend on it.** The
API key was filed as one and failed: it authenticates `/api/v1/*` for every
feature, so `features/items` had to import `features/apiKey`. Anything in that
position is core and belongs in `app/`. A feature may depend on `app`; it may
not depend on a sibling.

**The dependency runs one way: `features → app`.** A feature imports the logger,
the Prisma client, the error classes. `app` imports no feature, with a single
deliberate exception — `AppNav` reads `@/features` for the nav registry, which
is what makes the nav dynamic. Nothing else in `app/` may import a feature.

Tests sit beside what they test — `items.test.ts` next to `items.ts`, and each
feature's e2e spec at its root. There is no parallel `tests/` tree to keep in
sync; see "Tests".

**The boundaries above are enforced by `no-restricted-imports` overrides in
`oxlint.config.ts`, not by convention.** The full matrix, with every case
verified by writing the import and watching lint catch it:

| from → to | `client` | `shared` | `server` |
| --------- | -------- | -------- | -------- |
| `client`  | ok       | ok       | **no**   |
| `shared`  | **no**   | ok       | **no**   |
| `server`  | **no**   | ok       | ok       |

**`client → server` and `server → client` are banned for different reasons, and
the second is the weaker one.** A client file importing server code builds, then
breaks in the browser — Vite bundles Prisma and only warns about `node:`
builtins, and neither can run there. A server file importing client code builds
fine and fails at _runtime_, only if it calls something touching a browser
global. `src/app/client/utils/layout.ts` is exactly that: `writeLayoutWidth`
sets `document.cookie`, and a server caller would throw. `shared` is banned from
`client` for the same reason, since shared code runs on the server too.

The overrides are therefore split per run location rather than grouped —
`src/app/client/**` and `src/app/shared/**` need different rules, because client
code must still be able to import its own client modules.

**Client and shared code, every `nav.ts`, and `src/router.tsx` may not import a
Node built-in either** (anything in Node's `builtinModules`). Vite externalizes
those modules in the browser bundle with only a warning, so the build passes and
the page breaks at run time. A type-only import is allowed, since it erases.

**Every override that touches `no-restricted-imports` must also carry the global
`paths`.** An `overrides` entry **replaces** a rule's options rather than
extending them, so an override listing only `patterns` silently drops the ban on
`useEffect` — in `client/`, the one place it could ever be written. That was
verified by removing `paths` and watching the ban stop firing, and it is the
fourth instance of the same trap here after `requestMiddleware`,
`virtualRouteConfig`, and the route mounts: **declaring a list replaces a
default, it never supplements it.** Assume that shape for anything configurable
here.

**This is why the lint config is TypeScript, not `.oxlintrc.json`.** oxlint
documents no way to pin a rule globally, and there is no `no-restricted-syntax`
or `import/no-restricted-paths` to move the ban into, so the duplication cannot
be avoided — only centralised. `restrictImports(...)` spreads the shared `paths`
into every override, so `useEffect` is written once. `oxlint.config.ts` is
auto-discovered and works with the plain binary; only one of it and
`.oxlintrc.json` may exist per directory.

The ban covers `@/features/*` and everything below it, so the bare `@/features`
specifier is unbanned — but it resolves to nothing, because the registry module
it once named went when the glob moved into `src/app/nav.ts` and barrels were
banned outright. The nav crossing is the glob string, which no import rule can
inspect.

A new directory **under `src/`** needs no `tsconfig.json` change; `include`
lists `src` wholesale. The rule about adding to `include` is about new
directories at the **repository root**.

## No barrel files

**Never add a barrel file, and never name a file `index.ts` or `index.tsx`
outside a routes directory.** Both halves are absolute, and the second holds
even when the file is not actually a barrel.

A barrel is a module whose job is re-exporting its neighbours, so that consumers
import from the directory instead of from the file that defines the thing. Do
not write one. Every import names the module that owns the symbol —
`@/features/items/shared/schemas/items`, never `@/features/items`. Two imports
where a barrel would have given one is the correct outcome, not a cost to
engineer away.

The reasons compound, and the last one is why this is a rule rather than a
preference:

- **A barrel hides the dependency.** `no-restricted-imports` matches the import
  specifier, so the entire `client`/`server`/`shared` matrix above is only
  enforceable while specifiers name real locations. A barrel re-exporting server
  code launders it past every override — the importer names the barrel, which is
  allowed, and lint never sees the module underneath.
- **A barrel defeats the delete test.** `rm -rf src/features/<name>` is supposed
  to be the whole removal. An aggregation point somewhere up the tree turns that
  into a dangling re-export and a build error in a file the feature does not
  own.
- **A barrel pulls in what the consumer did not ask for.** Importing one symbol
  evaluates the whole module graph the barrel names. That is how a component
  reaching for a type ends up dragging a service — and on the client, a service
  that imports Prisma is a build failure with a stack trace pointing at neither
  file.

The naming half is separate and just as firm. `index.ts` announces a barrel
whether or not it is one, so a reader has to open it to find out, and the next
person to touch it reaches for the re-export that the name implies belongs
there. `src/app/index.ts` and `src/features/items/index.ts` were exactly this:
both held real `createServerFn` exports, and one of them had grown a single
`export *` on top. Both are now `rpc.ts`. **Name a file for what it holds** —
`rpc.ts`, `nav.ts`, `items.ts`, `http.ts` — and let the directory be a
directory.

The exception is the routes tree, where `index.ts` / `index.tsx` is TanStack's
file-based routing convention and means the index route of its segment. That is
a framework-assigned meaning, not an aggregation point, and it is the only place
the name may appear.

## Import paths

Two aliases, and between them **no import outside `src/generated` uses `../`**,
with one exception covered below — a file run directly by `node` instead of
through the application's own resolution:

| Alias | Resolves to | For                           |
| ----- | ----------- | ----------------------------- |
| `@/*` | `./src/*`   | everything in the application |
| `~/*` | `./*`       | repository-root files         |

`~/` is what `package.json` and `prisma.config.ts` are reached by from inside a
test — `src/app/shared/utils/app.test.ts` reads `~/package.json`, which used to
be `../../../../package.json` and broke every time its source moved a level. The
test harness needs no alias of its own: it lives in `src/app/testing/` and is
reached through `@/` like anything else.

A relative `./sibling` is still correct for a file in the same directory —
`MainLayout.tsx` importing `./MainLayout.module.css` is not a violation, because
nothing about it changes when the directory moves. **`../` is the thing to
avoid**: it encodes depth, and depth is what refactoring changes.

Inside a feature this holds too: its modules reach each other through
`@/features/<name>/…` like anything else.

`src/generated` is excluded because it is generated; do not hand-edit it.

**The root config files deliberately keep `./`.** `vite.config.ts`,
`vitest.config.ts`, `playwright.config.ts`, and `prisma.config.ts` are loaded by
their own tools' TypeScript loaders rather than through the application's
resolution, so an alias there is not guaranteed to resolve — and
`prisma.config.ts` is the one whose failure appears only inside the container.
They sit at the root, so `./x` is already the shortest true path and contains no
`../` to remove.

## Styling

**Use Mantine's style props, except for anything whose value is a `var()`, and
except for positioning and size.** The props are exhaustively listed in
`@mantine/core/esm/core/Box/style-props/style-props-data.mjs`; read that file
rather than guessing, because the set is smaller than it looks.

|                       |                                                                                                                        |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| **Props**             | spacing (`m*`/`p*`), `gap`, `flex`, `display`, `bg`, `c`, `bd`, `bdrs`, the type props, and `visibleFrom`/`hiddenFrom` |
| **CSS — positioning** | `position`, `top`/`right`/`bottom`/`left`, `inset`, `z-index`                                                          |
| **CSS — size**        | `width`/`height` and their `min-`/`max-` forms                                                                         |
| **CSS — any `var()`** | whatever the property, if the value is a custom property                                                               |

**A `var()` in a prop is the clearest case.** `w="var(--layout-aside)"` tells a
reader nothing — they have to open the module to find what `--layout-aside`
resolves to. Written as `width: var(--layout-aside)` it sits a few lines from
its own definition, so the file that raises the question also answers it. Every
custom property this app uses is defined in `MainLayout.module.css`, so that is
where its consumers belong.

Positioning and size stay in CSS **even when the value is a literal** — `top: 0`
and `min-height: 0` are geometry, and splitting geometry across two files is
what the rule exists to prevent. All three were written as props first and moved
back.

`min-height: 0` on a flex child is a size, so `.navBody`, `.main`, and the
content bodies each carry one rather than a `mih={0}` prop.

What has **no** prop at all and so is never a question: `overflow`,
`visibility`, `transform`, `transition`, `clip-path`, and single-side borders —
`bd` sets all four, so `border-bottom` is a CSS rule. Selector-dependent rules
stay too: custom property definitions, attribute selectors like
`.root[data-layout-width="full"]`, descendant selectors like
`.root[data-nav-open="true"] .nav`, and pseudo-classes. A prop styles one
element and knows nothing about its neighbours.

**Splitting one element between props and a class is expected, not a smell.**
`ContentLayout`'s header is a `Group` carrying `px`, `gap`, and `flex`, with a
class holding its height and border. That is the intended shape.

Style props become inline styles, so they beat any CSS module class. Never move
a property to a prop when a media query or a state selector in the module needs
to override it.

## React

**Never use `useEffect`.** `no-restricted-imports` and
`no-restricted-properties` both fail the build on it. Do not disable either; if
a case seems to genuinely require an effect, stop and ask.

Components are arrow functions with PascalCase names.

**Derived state is reset by remounting on a key, never by an effect.**
`ItemList` keys each `ItemRow` on `item.id`, so the row that appears in a slot
after a delete or a page change mounts fresh rather than inheriting the previous
item's editing state. Reach for the key before reaching for anything that
watches props.

**A mutation that deletes the row its own route loads navigates before it
invalidates**, or the loader re-runs against a 404 instead of letting the route
unmount. Nothing in this app is in that position any more — the list route is
not the deleted row's route, so its delete just invalidates — but a screen that
loads one record by id puts it back.
