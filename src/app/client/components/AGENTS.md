# Components

Reasoning behind the nav, the toasts, the theme and width controls, and the
Mantine styling detail. The rules are in the root `AGENTS.md`; this is why they
hold.

## The nav

**`src/app/nav.ts` assembles the navbar**, and it **discovers features rather
than listing them**:

```ts
const featureNav = import.meta.glob<{ nav: NavItem[] }>("@/features/*/nav.ts", {
  eager: true,
});
```

It merges the app's own entries with whatever features exist and sorts by
`order`. A feature joins the navbar by having a `nav.ts`; adding or deleting a
feature directory needs no edit. Assembly is the shell's job, so it lives in
`app/` — an earlier `src/features/index.ts` did the globbing and exported
`featureNav` to `AppNav`, which put shell logic under `features/`.

**A nav item may declare `search` and `children`, and neither adds state.**
`AppNav` derives both the open section and the active link from the router, so
nothing is stored and nothing can drift from the URL:

- **`Collapse`, not `NavLink`'s own `children`.** `NavLink` renders a chevron
  and owns the open state; driving `opened` from the route with no `onChange`
  gives a control that cannot toggle. `Collapse expanded={sectionActive}` has no
  control to be inert.
- **`sectionActive` is `matchRoute({ to: item.to, fuzzy: true })`** on the
  section root, and the same value drives the `Collapse` and the search merge
  below. It is derived from the nav tree, never from matching path strings by
  hand.
- **A parent with children is active for its whole section**, so the section and
  the item inside it are marked at once; a parent without children is matched
  exactly. That distinction matters because `matchRoute({ to: "/items" })` with
  no `search` matches _any_ search, so an exact test on a parent would light it
  up on every child anyway. The children are checked with `includeSearch`, and
  `useMatchRoute()` takes **one** merged options object — not
  `router.matchRoute`'s two-argument `(location, options)` form, where
  `includeSearch` inside the location object is silently ignored.
- **The two are styled differently, not identically.** A parent gets Mantine's
  filled `active` treatment; an active child gets a left border and no fill, so
  "which section" and "which view" read as different questions. See "Styling".
- **Links merge search forward**, which is what carries the page-size preference
  across the sub-nav. A link in the active section with its own overrides gets
  `(prev) => ({ ...prev, ...item.search, page: 1 })`; one with no overrides gets
  `(prev) => prev`; a link out of the section gets `undefined`. The identity
  updater is not redundant — `search={undefined}` **drops** the search entirely,
  so "Add item" would reset the page size without it. `page` resets on a filter
  change because the offset it names no longer means anything.

## Paging and dates

**`PageControls` is the one pager.** The "Showing x–y of z" row, the per-page
`Select`, and the `Pagination` with its edge-control labels were copied between
`ItemList` and `JobRunsTable`, CSS module included; the history table is
documented as reusing the items list's mechanics and now does. The table is its
`children`, since it sits between the two halves.

**`useDateFormats` is how a leaf reads the stored date formats**, from the root
loader, so no page threads them down as a `formats` prop through two layers to
the cell that formats. `SettingSelect` is the discrete control that writes at
once — it takes the Zod schema of its options, which is what keeps a stale
option from reaching the store.

## Tables and Mantine controls

Tabular data is a `Table` with its own parts (`Table.Thead`, `Table.Tr`,
`Table.Td`), never a stack of `Group`s dressed as rows — the parts are what make
it a table to a screen reader. Column widths belong in a CSS module beside the
component (`ItemList.module.css`), because a width is a size and sizes are CSS.
A column whose header shows no label — the completion checkbox, the row actions
— still needs one, so its `<th>` holds a `VisuallyHidden` string rather than
being empty: that is what a screen reader announces for every cell beneath it.

**A class on a `<th>` reaches that header cell and nothing else.** CSS has no
column combinator, and a `<col>` will not carry `white-space`, so a column that
sizes to its content has to put the class on the body cell too — which is why
`ItemList.module.css` has three column rules that look identical and are applied
to different numbers of elements, and why the name class below is worn by the
`<th>` and by the `<td>` in both `ItemRow` and `NewItemRow`. Styling a column is
styling every cell in it, one by one.

**Truncating a cell needs `max-width: 0`, and the reason is the layout
algorithm.** Mantine's `Table` is `width: 100%` with
`table-layout: var(--table-layout, auto)` and nothing here sets that variable,
so the table is **auto** — every column is as wide as its widest cell asks to
be, and `width: 100%` is a floor rather than a cap. `text-overflow: ellipsis`
alone does nothing in that mode: a `white-space: nowrap` name cell asks for the
whole string, the column grows, and the overflow lands on the **document**, not
on the table, whose own `scrollWidth` and `clientWidth` both grow with it — so
measuring the table would have missed it entirely. `max-width: 0` on the name
cells takes them out of the column-measuring pass, so the three content-sized
columns are measured first and the name column is handed the remainder as a
_definite_ width for the `<Text truncate>` inside it to clip against.

Two alternatives were measured and rejected. `table-layout: fixed` is the
spec-clean answer and costs four magic column widths in place of three
content-sized rules, one of them for a relative timestamp whose text runs from
"2 minutes ago" to "about 2 months ago". Truncating on the `<td>` itself works
and puts `overflow: hidden` on the cell that also holds the rename `TextInput`,
clipping its focus ring.

**`max-width` on a table cell is undefined in CSS 2.1 and defined only by
css-tables-3.** Chromium implements it and Chromium is the only engine this
suite runs, so the e2e case proves it here and nowhere else. That is the same
caveat the scrollbar geometry carries under "Scrolling", and it wants the same
answer: check a change to this on another engine by hand.

**Mantine's `Badge` truncates its own label**, with `overflow: hidden` and an
ellipsis on the label plus `max-width: 100%` on the root. In a table it reads
fine until the column is squeezed and then says `succee…`, which loses the only
thing the cell carries. `JobStatusBadge` overrides both parts and the column
beside it is `width: 1%`, so the truncating column is the one built for it.
**Nothing in the accessibility tree can see this** — the text content stays
whole while CSS clips it — so the e2e case narrows the viewport and measures
`scrollWidth` against `clientWidth`, the same technique `UndoToast`'s button
needs.

**Mantine's `Select` input is about 200px wide by default**, which is enough to
wrap a toolbar row on its own, so a `Select` sitting in a row of controls needs
an explicit width. Write that as a descendant selector on your own wrapper
class. It then wins on **specificity** rather than on stylesheet order, which
matters because Mantine's stylesheet is linked from `__root.tsx` while modules
are bundled — the order between them is not something to rely on. Where Mantine
has a prop that sets the custom property itself, use it rather than declaring
the property in a module: `Progress`'s `size` lands `--progress-size` as an
inline style, so the ordering question never arises.

**A label after its control is `inputWrapperOrder`, not a reversed flex row.**
The page-size `Select` reads `[10 ▾] per page` because
`inputWrapperOrder={["input", "label"]}` reorders the DOM, so the visual order,
the reading order and the `<label for>` association all still agree. Reversing
the row in CSS moves the label on screen and leaves the other two behind it.

**Three Mantine controls ship with no accessible name at all**, and both are
icon-only so nothing looks wrong: `Pagination`'s edge controls, which take
theirs through `getControlProps`, and `Notification`'s close button, which takes
one through `closeButtonProps`. Assume any icon-only Mantine subcomponent is
unnamed until an assertion says otherwise.

**Mantine styles an active `NavLink` through
`:where([data-active], [aria-current='page'])`.** `:where()` contributes nothing
to specificity, so the whole selector is a single class and a module class with
an attribute selector overrides it cleanly — no `!important`, and no fighting an
inline style, which is what would have made this impossible. That is how the
active sub-nav item drops the fill and takes a left border instead. The border
is declared transparent on every sub-item so selecting one does not shift the
labels, and `border-left` is safe here only because Mantine's `NavLink` root has
no radius to bend it into a crescent — the `Menu.Item` case below needs a
`::before` for exactly that reason.

**Restoring the hover background is part of the job.** Neutralising Mantine's
active fill kills its hover with it, since both come from the same variables.

**`aria-current` is the wrong hook for _this_ one, and it is the exception to
the `Menu.Item` rule below.** TanStack's `Link` sets `aria-current="page"` by
its own activeness rules and Mantine treats that as active, so keying the visual
off it would bind the styling to the **router's** notion of active rather than
the component's — the precise drift that keying off semantics is supposed to
prevent. `data-active` is what the component itself controls. Check who writes
an attribute before you decide it is the semantic one.

**Use `Group` and `Stack`, not `Flex`.** `Group` is the row, `Stack` is the
column, and naming the axis in the component says what the layout is without
reading a `direction` prop. `Flex` is the escape hatch for something neither
covers — `wrap` behaviour that differs per breakpoint, say — and there is no
such case in this codebase today.

**Both default to `gap="md"`, and `Flex` does not**, so a swap that keeps the
markup identical still changes the rendering. Every conversion here carries an
explicit `gap={0}`: the shell columns were `Flex direction="column"` with no gap
and the geometry depends on that. `layout.spec.ts` is what catches it — its
assertions are pixel comparisons, so injected spacing fails them.

A CSS module lives beside the component that owns it, which is why the shell's
are in `src/app/client/layouts/` and everything else's sits next to its own
`.tsx`. The layout's geometric e2e cases in `src/app/layout.spec.ts` are what
verify a conversion did not move anything; run them, do not eyeball it.

## Icons

Phosphor (`@phosphor-icons/react`), regular weight, no `IconContext` provider.

**Import one icon per module path — never from the package root.**
`@phosphor-icons/react/Sun` resolves to `dist/csr/Sun.es.js` through the
package's `./*` export and carries its own types. The root entry re-exports
**1,513** icons; it is a barrel in the exact sense the "No barrel files" section
describes, and it costs dev-server time even where the production build
tree-shakes it away.

**The export is `<Name>Icon`.** The bare `Sun` alias still exists and is marked
`@deprecated` in the package's own types.

**`/dist/ssr` is for React Server Components and is the wrong entry here.**
Start does classic SSR with hydration, not RSC, so the CSR build is correct — it
renders on the server perfectly well.

**Nothing may branch on the color scheme while rendering.** With
`defaultColorScheme="auto"` the resolved scheme is unknowable on the server, so
`{dark ? <SunIcon/> : <MoonIcon/>}` is a guaranteed hydration mismatch — the
same class of bug as the locale and timezone rule below, and equally invisible
locally. `ThemeToggle` renders **both** icons and lets Mantine's `lightHidden` /
`darkHidden` hide one in CSS. Those resolve to `display: none`, so the hidden
control leaves the accessibility tree and the tab order rather than merely being
invisible.

**The icon names the scheme a click switches to, not the one in effect** — a
moon in light mode. Showing the active scheme was the first version and was
wrong. Because each button is fixed, its `aria-label` can be specific ("Switch
to dark theme") without reintroducing the mismatch: the label belongs to the
button, not to the current scheme, so every request renders both identically. A
single button whose label changed with the scheme would be the bug.

It is **two `ActionIcon`s rather than one holding two icons**, and that is a
`Box` constraint, not a preference. `lightHidden`/`darkHidden` are `Box` props,
Phosphor icons are not `Box`, and `Box` **destructures `size` and forwards
`__size` instead** — so `<Box component={SunIcon} size={16} />` silently drops
the size. `ActionIcon` is already a `Box`, so putting the props there keeps both
mechanisms native. The e2e case asserts the hidden button is absent from the
accessibility tree entirely, which is what proves the CSS is doing the hiding —
and, because the two labels differ, pins the direction at the same time.

**`WidthMenu`'s items are text only.** They carried an icon each and it was
removed: the icon has to be read _and_ the label has to be read, so it adds a
glance without adding information.

**The active width carries `aria-current`, and that part is settled.**
`Menu.Item` sets `role="menuitem"` **after** spreading your props, so the role
cannot be promoted to `menuitemradio` and `aria-checked` would be invalid on it.
`aria-current` is valid on any element and is announced; without it the marker
is decorative and a screen reader is told nothing.

**The CSS keys off `[aria-current="true"]` rather than a class**, so the visual
cannot drift from the semantics, and the e2e case asserts the attribute rather
than the styling.

**The visual treatment is provisional and is expected to change.** A leading
`CheckIcon` is what ships. A bold label, a `::before` accent bar, and a tinted
background were each tried and rejected by eye. Because of the two rules above,
swapping it again is a CSS-and-markup change with no test to update — which is
the point of writing it this way. Notes from the attempts, so they are not
rediscovered:

- **The check renders on every item**, hidden on the inactive ones with
  `visibility` — `display: none` would drop the reserved space and shift every
  label as the selection moved. It is applied through
  `classNames={{ itemSection }}`, Mantine's per-part API, not by reaching at the
  DOM.
- **An accent bar must be a `::before`, not `border-left`.** `Menu.Item` is
  rounded, so a real border bends with the radius into a crescent.
- **A selected background must not reuse the hover colour.** Mantine drives
  hover from `--menu-item-hover`; setting that plus `--menu-item-color` on the
  selected row keeps its tint on hover while other rows stay neutral. Overriding
  `background-color` alone makes selection and hover indistinguishable.

Two things worth keeping from that attempt. Icons that differ only in proportion
do not survive 16px — `SquareIcon` and `RectangleIcon` were indistinguishable,
which is what a silhouette-level difference fixes. And that was found by
rendering them and looking, which is the only way to settle it; the package's
`.d.ts` files embed a base64 preview of every weight, so a throwaway HTML
gallery beats guessing from names.

## Toasts

**Every timed toast goes through `timedToast`**
(`src/app/client/utils/toast.tsx`), which wraps the message in `CountdownToast`
(`src/app/client/components/CountdownToast.tsx`) and sets `autoClose` from the
same `TOAST_TIMEOUT` the bar is given. Its input is
`Omit<NotificationData, "autoClose">`, so there is no second duration a caller
could pass and nothing for the bar and the timer to drift apart over. The
stylesheet holds no time at all — the duration reaches it as a custom property
on the element. The builder and the component are **two files** because one
module exporting both trips `react/only-export-components`, the same warning
that moved `RootLayout` out of `__root.tsx`.

**The countdown is one CSS keyframe, never a ticker.** A Mantine `Progress`
section drains by `transform: scaleX(1 → 0)` from the moment it mounts, so
nothing counts in React and nothing has to be torn down when the toast goes. It
is `withAria={false}`: a `progressbar` pinned at `aria-valuenow=100` while it
visibly empties would be a lie, and the message already carries the meaning —
which leaves `data-countdown` as the only handle the e2e case has on it.

**The bar rides inside the `message`, not on the toast root**, and that is what
makes `notifications.update` behave. An update shallow-merges, so replacing the
message replaces the countdown with it and a toast moving to an untimed state
needs nothing cleared by hand. On the root instead — which is where a `::after`
put it — every such update has to remember to clear the bar's class, and one
that forgets drains toward a deadline that no longer exists.

**The pause on hover is scoped to the container, not to the toast.** Mantine's
default is `pauseResetOnHover: "all"`: hovering any toast cancels **every**
toast's auto-close timer and leaving starts a fresh full-length one for each. So
the rule is
`.mantine-Notifications-root:has(.mantine-Notification-root:hover) .bar`, and
dropping the animation is what restarts the keyframe from full on leave. A
per-toast `:hover` was correct only while a single toast could exist, which
stopped being true the moment errors became toasts. It depends on two Mantine
static class names, so an e2e assertion on the computed `animation-name` pins
them and a rename fails a test rather than quietly leaving the bar unpaused.

**The three notification calls are not interchangeable, and this was settled by
probing rather than by reading.** `notifications.show` with an id already on
screen is a **silent drop** — the store returns its list unchanged.
`notifications.update` merges into the mounted element, so the message
reconciles onto the same DOM node and neither the CSS animation nor Mantine's
auto-close effect — keyed on `[autoCloseDuration, active, dismissed]` —
restarts. Only a **fresh mount** restarts both, and the React key is the
notification id. So `showErrorToast` hides the live toast and shows a **new**
id, and it collapses on the **message** rather than on the id: retrying a
failing action three times is one piece of news, while two different failures
stay two toasts. The map of live error toasts is cleaned from each
notification's own `onClose`, which `hide` invokes on the way out.

**The undo-failure toast is the one that never counts down.** It goes to
`notifications` directly rather than through `timedToast`: the item is already
deleted and its Restore button is the only way back, so nothing may take it off
screen and nothing may suggest something is about to. That is the exception to
look for before making every toast timed.

**`@mantine/notifications` is mounted once**, in `RootShell`, with its
stylesheet linked from `__root.tsx`, and it is the app's only toast surface.
`notifications.show` has **no `action` field** in 9.5.1 — a toast's button goes
inside `message`.

## Locale and timezone

**Nothing formatted from the ambient locale or timezone may render on the
server.** A bare `toLocaleString`, `toLocaleDateString`, or `Intl` formatter
resolves both from the environment it runs in — the Node process on the server,
OS settings in the browser — so SSR bakes in one answer and hydration computes
another. It is not only a timezone bug: a differing default locale renders
`11/08/2026` against `8/11/2026` at the same instant.

`/items` carries `ssr: "data-only"` for exactly this, and it is what lets
`ItemTime` call `toLocaleString` and `Intl.RelativeTimeFormat` with no explicit
locale. It sits on the layout route, and a child inheriting `true` resolves to
`data-only` under a `data-only` parent, so the whole section is covered — which
also means a new route under `/items` inherits the licence to format from the
ambient locale without asking for it. On a route that does server-render, either
pass an explicit `timeZone` and locale, or move the value behind
`useSyncExternalStore` with a matching server snapshot — never `useEffect`, and
never `suppressHydrationWarning`, which silences the warning while leaving the
server's value on screen.

The failure is invisible locally, because the dev server and the browser share a
machine and timezone. It appears in Docker, where the container is UTC and the
browser is not. The Playwright fixture in `src/app/testing/e2e.ts` fails any
test whose page emits an uncaught `pageerror`, which is what catches it.
