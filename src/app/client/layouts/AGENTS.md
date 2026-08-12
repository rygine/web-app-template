# Layout

Reasoning behind the shell — geometry, scrolling, the drawer, the panel, the
header. The rules are in the root `AGENTS.md`; this is why they hold.

`src/app/client/layouts` holds the shell itself — `RootShell`, `RootLayout`,
`MainLayout`, `ContentLayout`, `SidePanel`, and their CSS modules. `RootShell`
is the outermost, supplying the `<html>` document as TanStack's
`shellComponent`. **`AppBrand` and `AppNav` are in `components/`, not here**:
they render _inside_ the shell rather than composing it, which is the line
between the two directories. The layout's context lives in
`src/app/client/contexts/layout.ts` and its width helpers in
`src/app/shared/utils/width.ts`; see "Source layout" under Conventions.
`src/routes/__root.tsx` exports only `Route`; its `component` is `RootLayout`
(`src/app/client/layouts/RootLayout.tsx`), which reads the root loader's data
with `getRouteApi("__root__")` and mounts `MainLayout` once, so the navbar never
remounts on navigation. `RootLayout` declared inline in `__root.tsx` was tried
first and reverted: it was the only file exporting a component alongside
`Route`, which is what `react/only-export-components` flagged as the codebase's
sole lint warning. Moving it out matches every other route, which sources its
component elsewhere and reads loader data back through `getRouteApi` —
`Settings` and `ItemList` do the same. Every screen renders `ContentLayout` as
its root, which supplies the content header.

The geometry is four custom properties on the layout root, and every non-mobile
case falls out of them without a branch:

```text
--layout-content  min(preference, 100% - 2 * aside floor)
--layout-side     (100% - content) / 2          the centering offset
--layout-aside    min(side, aside ceiling)      navbar and panel width
--layout-offset   side - aside                  empty remainder, pushed outside
```

The navbar is `left: var(--layout-offset); width: var(--layout-aside)` and the
panel is the mirror on the right, so both end exactly where the content begins.
**The content is centered at every width above mobile**, because
`--layout-content` caps itself against the viewport and the two sides are equal
by construction. **Asides shrink before the content does** — only once
`--layout-aside` hits its floor does the content give ground.

Wide mode changes `--layout-content-pref` alone. Full mode overrides four tokens
and is the only non-mobile mode where the content is not centered and the only
one where the panel overlaps it — there is no reserved region left for the panel
to sit in.

## Scrolling

**The document scrolls. The shell does not.** `.root` is `min-height: 100dvh`
with no `overflow`, the navbar is `position: fixed`, and `ContentLayout`'s
header is `position: sticky; top: 0`. Nothing has an internal scroll region
except `.navBody`, which is inside the fixed navbar and therefore needs one.

**This replaced a fixed shell whose content area scrolled internally**
(`height: 100dvh; overflow: hidden` on `.root`, `overflow-y: auto` on the
content body). It was changed for one reason: **mobile browsers retract the URL
bar only in response to _document_ scroll.** With the old model the document
never scrolled, so the bar never retracted and the app permanently rendered into
the small viewport — roughly 7–12% of the screen, unrecoverable by any other
means.

**The geometry uses `100%`, never `100dvw`, and that is what makes a scrolling
document safe.** A percentage resolves against `.root`'s content box for in-flow
children and against the initial containing block for the fixed navbar; **both
exclude a classic scrollbar, and `dvw` includes it.** With `dvw` and a scrolling
document, every expression over-reports the viewport by the scrollbar width,
`--layout-side` halves that, and the content mis-centres while the navbar's
right edge stops meeting it — the two things `layout.spec.ts` asserts to within
1px.

`html` carries `scrollbar-gutter: stable`. That is not what fixes the above; it
stops the centred column shifting when the scrollbar appears and disappears with
content length.

**Only CI verifies the scrollbar reasoning.** CI's Linux Chromium has classic
scrollbars, so `scrollbar-gutter: stable` reserves 15px there even on a page
that does not scroll, and `layout.spec.ts` measures the centering against
`document.body.clientWidth`, which excludes it (`documentElement.clientWidth`
does not). A regression to `dvw` mis-centres the column by half the gutter and
fails there. macOS Chromium overlays its scrollbars, so a local run exercises
only the overlay case: **a change to these expressions needs a green CI run, not
just a local pass.**

Scroll restoration needs no configuration now: the window is the scroll
container, which TanStack handles natively — it resets on a forward navigation
and restores on Back. `src/router.tsx` previously set `scrollToTopSelectors`
pointing at the content element, because the router resets **window** scroll by
itself but resets an **element** only if named there; with the window pinned at
0, nothing reset the content area and a new page inherited the previous page's
offset. That option and the `data-scroll-restoration-id` it referred to are both
gone with the model that required them.

`src/app/layout.spec.ts` still pins the behaviour in one case — the sticky
header stays at `y: 0` while the document scrolls, a forward navigation starts
at the top, and Back restores.

Content widths are in `ch` and chrome is in `rem`, deliberately. A content
column is a measure — "how many characters fit on a line" — and `ch` tracks font
size. The aside bounds and header height are sized by what they contain. One
consequence: `ch` resolves against the _loaded_ font, so adding a webfont would
reflow the content column when it swaps. There is none today.

**The width preference is a cookie, not `localStorage`.** `__root`'s loader
calls `getShell` (`src/app/rpc.ts`), which reads it server-side, and TanStack
serializes the result into the hydration payload — so the server and client
render the identical width and `MainLayout` can seed plain `useState` from it. A
`localStorage` version was designed and rejected: it needs an inline
pre-hydration script (a string, so unlintable and untypechecked),
`useSyncExternalStore` with a `getServerSnapshot`, and imperative `<html>`
writes, and it still only _converges_ on the right answer after hydration
instead of starting there.

**This paragraph is load-bearing a second time**, and it is what decided the
Style section of the settings screen: theme goes to `localStorage` because it is
never read before first paint, and the width stays a cookie because it is. Both
are per-browser rather than stored settings, so **the layout width cookie is
still the app's only cookie** and the CORS reasoning that depends on that is
unchanged. `SettingsStyle` is a second consumer of `writeLayoutWidth` beside
`WidthMenu`, not a new mechanism.

The mode attribute goes on `MainLayout`'s own element rather than `<html>`.
Custom properties inherit, so nothing needs the document element, and
`RootShell` stays untouched.

**Nav-open is not persisted** — a drawer that restores itself open is a bug. It
is React state, published through `src/app/client/contexts/layout.ts`, and read
by CSS as `data-nav-open`. No JavaScript breakpoint detection exists anywhere:
the burger is `display: none` above the breakpoint, so the state can only ever
be true below it.

Below the breakpoint, `.nav` is hidden with both `visibility: hidden` and
`transform: translateX(-100%)`, not the transform alone. Playwright's
`toBeHidden()` checks computed `visibility` before a bounding rect, which a
transform never zeroes, and `visibility: hidden` is also what drops the closed
drawer's links out of the tab order — a transform alone leaves them off-screen
but still focusable. `visibility` sits in the transition list beside
`transform`, so it changes as a discrete step instead of fading: opening flips
it at the start of the transition, so the slide-in is visible, and closing flips
it at the end, so the slide-out plays before the drawer leaves the accessibility
tree.

Dismissal by tapping outside uses **a scrim element, not `useClickOutside`**. A
hook that closes on `mousedown` lets the following `click` land on whatever was
behind the drawer, so a tap meant to dismiss also activates a control. Links
close the drawer from their own `onClick`; nothing watches the router for
location changes, which would be effect-shaped.

## The panel is opened by a route

`SidePanel` has no open state. It renders because a route rendered it, and
closing is a navigation. TanStack Router has no parallel outlets, so **a route
that opens a panel renders its main content directly and places `<Outlet/>` as a
sibling of the layout**:

```tsx
// features/<name>/routes/pages/route.tsx — owns the screen
<>
  <ContentLayout title="…">…</ContentLayout>
  <Outlet />
</>

// features/<name>/routes/pages/<panel>/index.tsx — owns the panel
<SidePanel title="…" close={<CloseButton component={Link} to="/<name>" />}>
  …
</SidePanel>
```

Feeding `<Outlet/>` to the main content and expecting the panel beside it is the
obvious mistake and does not work. Nesting the panel's route under the screen's
own segment is what keeps the screen mounted while the panel is open. A layout
route with children and no index route renders its parent with an empty
`<Outlet/>` — verified — so the no-panel case needs no index route.

`SidePanel` is a sibling rather than a `ContentLayout` prop, which is only
possible because it is `position: fixed` and therefore indifferent to where in
the tree it is mounted. It must still be a DOM descendant of `MainLayout`, since
it reads the layout's custom properties by inheritance.

**`SidePanel` still has no consumer, and it was tried.** `/system/jobs/$runId`
rendered a run's logs in it and the panel was the wrong shape for the content:
it is a fixed narrow column, log lines are wide, and every line wrapped into an
unreadable ribbon. The logs are a **Modal** now, sized in `rem` with a
`max-width` against the viewport so it never overflows on a phone, and the block
scrolls horizontally rather than wrapping.

**It is still a route**, which is the part worth keeping from that attempt: a
run's logs have their own URL, closing is a navigation, and every link in and
out carries `search={(prev) => prev}` so the history filters behind the modal
survive. A modal does not have to mean local state.

**Reading that route's loader data from a separate module breaks the production
build.** `getRouteApi("/system/jobs/$runId")` and `useLoaderData({ from })` fail
identically: the SSR bundle emits `export { ssr_exports }` in `_ssr/ssr.mjs`
without ever declaring it, and **every request 500s**, `/health` included. It is
silent at build time — `yarn build`, `yarn typecheck`, and `yarn lint` all pass.

**The route reads its own data and passes it down as props instead.** Bisected:
the same component is fine inline in the route file, and fine when it takes
props; Mantine and `SidePanel` are innocent; a trivially imported component is
fine. Only reading _this_ route's data from another module triggers it. The
component is declared unexported in the route file and named PascalCase so
`rules-of-hooks` accepts it, with `react/only-export-components` suppressed
there — the usual fix for that warning, moving the component out, is the very
thing that breaks the build.

## The header carries one title

`ContentLayout`'s `title` is required, and every screen passes a literal. The
items screens all pass `"Items"` — the filtered views and `/items/new` included
— because the toolbar's segmented control is what names the active filter, and a
header repeating it would say the same thing twice in the same glance.

**A breadcrumb trail was built here and removed.** `ContentLayout.title` was
optional, and omitting it rendered a `Breadcrumbs` component that walked
`useMatches()` collecting a `staticData.crumb` from each, with the last crumb as
the `<h1>`. It worked, and the mechanism is worth knowing about if location ever
needs to survive more nesting than one filter — `staticData` plus a
`StaticDataRouteOption` augmentation is how a route contributes to chrome it
does not render. It went for being the wrong shape for a two-level app, and it
went **whole**: a dormant crumb system nobody renders is worse than none,
because the next person has to work out whether it is load-bearing.
