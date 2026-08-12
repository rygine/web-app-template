# Features

What a feature is, how it is discovered, and what deleting one costs. The rules
are in the root `AGENTS.md`; this is why they hold.

## Route mounting

**Routes are mounted from features by `virtualRouteConfig`, composed in
`src/routes.config.ts`.** `physical("/items", "../features/items/routes/pages")`
maps a directory outside `src/routes` into the tree, and it works for both page
routes and REST handlers — verified against the production build and against
`yarn dev`.

**The mounts are discovered, not listed.** That file reads `src/features` with
`node:fs` and mounts `routes/pages` at `/<name>`, so adding or removing a
feature needs no edit anywhere.

**A feature owns its API versions.** Every directory under `routes/api` mounts
at `/api/<version>/<name>`, so `v1` and `v2` ship side by side and the version
is the feature's decision, not the config's. Two mistakes throw at config load
rather than mounting something wrong or nothing at all: handlers placed directly
in `routes/api` with no version directory, and a directory that is not `v<n>`.
Both were verified by making them. **`import.meta.glob` cannot be used for
this** — it is a Vite transform, and a config module is bundled by esbuild and
run in Node, where it fails with `(intermediate value).glob is not a function`.
That was tried.

**It lives at `src/routes.config.ts` — inside `src/`, and at its top level.**
Two separate constraints pin it there.

It must be under `src/` rather than the repository root, because a root config
file has to be named in `tsconfig.json`'s `include` _and_ copied by the
Dockerfile's `build` stage, and forgetting the second breaks the image while
`yarn ci` stays green. Under `src/`, `include: ["src"]` and `COPY src ./src`
already cover it. Root placement was tried and reverted for exactly that reason.

Within `src/` it sits beside `router.tsx` and `start.ts` rather than in `app/`
or `routes/`. It is not core in the `app/` sense — it is not something the
running application imports — and `src/routes/` holds route modules, where every
file is named by the config itself; a config file among them is the one entry
that describes the directory instead of belonging to it. Both placements were
tried. The generator ignores a non-route file in `src/routes` because
`virtualRouteConfig` replaces scanning, so the move out was a legibility
decision rather than a bug fix.

**`FEATURES_DIR` is `join(import.meta.dirname, "features")`, and the depth is
load-bearing.** It was `"../features"` while the file sat one level down, and
both `src/app` and `src/routes` resolved that identically — which is exactly why
moving between those two hid the coupling. Moving to `src/` broke it. The
`physical()` strings are unaffected by any of this: they resolve against the
routes directory, not against this file.

**Declaring `virtualRouteConfig` replaces automatic scanning**, exactly as
declaring `requestMiddleware` replaces Start's default CSRF middleware. The
array is the complete route list, never a supplement — app-level routes are
written out, feature routes come from the scan. Each unit pins its own paths
(`src/app/routes.test.ts`, `src/features/items/routes.test.ts`), because a
dropped mount is otherwise silent: the build succeeds and the route is gone.

Adding, editing, or deleting a route file _inside_ an existing mount hot-reloads
with no restart. **A brand-new feature directory needs a `yarn dev` restart**,
because the scan runs once when the config loads — measured, not assumed.

Routes are **nested directories, never dot notation** — `routes/api/v1/` holding
`index.ts` and `$id.ts`, not `routes/api.v1.$id.ts`. A layout route is
`route.tsx` inside its directory. Both forms compile to the same tree; mixing
them in one project does not.

## The two root files

Two files sit at each feature's root, and neither belongs in `client`, `server`,
or `shared`:

- **`rpc.ts` — the RPC boundary.** The `createServerFn` surface. Its handlers
  run on the server while browser code imports it; the Start compiler swaps each
  handler for an RPC stub in the client build. That is why it cannot be filed by
  run location: it is the sanctioned crossing point, and the only place client
  code may reach something that touches the database.

  **It was `index.ts`, and the rename is the point.** An `index.ts` reads as a
  barrel — a file whose job is to re-export its neighbours — and that is the
  opposite of what this is. `serverFunctions.ts` was considered and rejected:
  `server/services/items.ts` also holds functions that run on the server, so the
  name would be equally true of a file in the same feature and discriminates
  nothing. `rpc.ts` names the property only this file has — **it is callable
  from the browser** — and every consequence a caller must know follows from
  that word: the call is a network round trip, its arguments serialize, it is
  async whatever the service beneath it is, and it can fail in ways a local call
  cannot. Keep the file to the `createServerFn` exports; anything else in it
  makes it a barrel again under a better name.

- **`nav.ts` — the manifest.** What the feature declares to the shell. Kept out
  of `rpc.ts` on purpose: assembling the nav from the RPC boundary would pull
  every feature's server-function surface into the client import graph to render
  a couple of links.

## Discovery

**An explicit list was tried first and replaced.** It was chosen because a glob
pattern is a string — unlintable, untypechecked, and a typo empties the navbar
with no error. Discovery is better _provided that silence is closed_, and it is:
`items.spec.ts` asserts a feature link actually renders in the navbar. Breaking
the pattern fails that test, which was verified by breaking it.

**The guard belongs to a feature, not to `app`.** `layout.spec.ts` exercises the
navbar too, but its assertion uses the **Settings** link, which comes from the
app's own entries — an empty feature glob would leave that passing. Only a
feature-owned assertion covers discovery, and it disappears with the feature, at
which point an empty nav is the correct answer.

**The glob is the one `app → feature` crossing lint cannot see.** It is a string
argument, not an import, so `no-restricted-imports` never inspects it. Every
real import from `src/app/**` into a feature is blocked by a catch-all override,
including the app-root files (`rpc.ts`, `nav.ts`) — those matched none of the
run-location overrides until the catch-all was added, which was found by probing
rather than by reading.

`src/routes/**` and `src/routes.config.ts` carry the same ban through an
override of their own. They are outside `src/app/**` and so were never covered
by the catch-all; the config file was, until it moved out. It reaches features
through `node:fs` rather than imports, so the rule has nothing to catch there
today — it is the app-level route modules the override actually guards.

**Deleting a feature is `rm -rf src/features/<name>`, and nothing else.** Its
routes, its navbar entry, and its Prisma models are all discovered, so none of
`src/routes.config.ts`, `src/app/nav.ts`, or `prisma.config.ts` needs an edit.
No application code references a feature, because none of it may.

**The e2e harness is the exception, and it is deliberate.**
`src/app/testing/e2e.ts` seeds through `/api/v1/items` and probes the shared
database with an `Item` row, and `src/app/auth.spec.ts` and
`src/app/layout.spec.ts` both drive `/items` for their subjects. That is the
starter using its worked example as scaffolding rather than a boundary violation
— but it means removing the example domain is `rm -rf src/features/items` **plus
giving the harness a new subject to seed**. Nothing about it fails a build; it
fails the e2e suite.

**Reshaping a screen _inside_ a feature is not self-contained either**, for the
same reason. `auth.spec.ts` creates an item through `/items/new` to capture a
real server-function call, so renaming that control or deleting that route
breaks a file the feature does not own — which happened in two consecutive
changes here, making it a pattern rather than an accident. Grep the app-level
specs for the paths and control names you are changing before assuming the
change is local.

**Its tables are not dropped by that command.** The models go with the
directory, so the next `yarn prisma:migrate` generates the `DROP TABLE` — an
ordinary migration landing in the shared history like any other. Prisma has no
per-feature migration history, and adding one is not on the table.

**A feature may import another feature, and that is deliberate.** Only
`app → feature` is linted. Enforcing sibling isolation was tried twice and
removed both times: `no-restricted-imports` matches the _import specifier_ and
never the importer's path, so "any feature but my own" is inexpressible. The two
workable shapes each cost more than the rule was worth — a per-feature override
with a negated group, which every new feature would have to register, or a
blanket ban on `@/features/…` from inside a feature, which forces every
self-import to be relative. Do not reintroduce either.
