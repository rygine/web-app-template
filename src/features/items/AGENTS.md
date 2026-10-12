# The worked example

Why the `Item` domain is shaped the way it is. The rules are in the root
`AGENTS.md`; this is why they hold.

The `Item` domain — schema, service, server functions, `/api/v1/items`, and the
one screen it renders — is a **worked example, not a feature**. It exists to
show the wiring end to end and is meant to be deleted wholesale once a real
domain replaces it. Keep it minimal: a list with paging, a status filter and a
bounded page size, read, create, partial update, and delete, which together
cover both transports, Zod validation in the service, error-to-status mapping,
P2025 handling, validated search params, and mutations with pending/error state.

**The screen is one table with a toolbar over it.** `/items` renders it and
`/items/new` renders the same table with a blank row in it; there is no detail
page. Completing, renaming and deleting all happen in a row, so each mutation is
a control beside the data it changes rather than a screen of its own. The
toolbar holds a `SegmentedControl` for the status filter and the `Add item`
link, and it is what tells the user which filter is active — which is why the
content header is the fixed string "Items" on every items screen rather than
naming the filter.

`update` earns its place despite overlapping `create`: it is the only operation
combining an id with a **partial** validated body — every field optional, with a
`refine` rejecting a body that names none of them — which server functions
express by folding the id into the body (`updateItemInputSchema`) while the REST
route takes it from the path. Nothing else shows that shape, and the completion
checkbox is what makes a one-field update the ordinary case rather than a
curiosity.

Do not grow it to prove a point. Add a case only if it demonstrates a mechanism
nothing else does.

## Data access

Two transports, deliberately, and they must not be conflated:

- **The UI calls server functions** (`src/features/items/rpc.ts`). The Start
  compiler swaps each handler for an RPC stub in the client build and drops the
  service import, which is what keeps Prisma out of the browser bundle. Dates
  survive the wire, so nothing re-hydrates them.
- **The REST routes** (`src/features/items/routes/api/*`) are the external API
  surface, and the only thing the e2e suite seeds through. They serialize
  through `toItemResponse` / `toItemListResponse`, so a REST body carries **ISO
  strings** where a server function carries `Date`.

`Item` describes the domain and `ItemResponse` the wire. Keep them apart: typing
the REST bodies with `Item` says `createdAt` is a `Date`, which is false on that
transport and is the one place the two were previously conflated. `DELETE`
returns 204 with no body and needs no mapper.

Both funnel into `src/features/items/server/services/items.ts`, which validates
its own input. Do not add a hand-rolled fetch client for the UI, and do not let
a route handler reach Prisma directly.

**`completedAt` is written by the service, never defaulted.** Prisma has no
conditional default, so `createItem` and `updateItem` stamp it when `completed`
becomes true and clear it when it becomes false — one place, both transports.
Completing an already-complete item restamps it; keeping the original would cost
a read-modify-write on every toggle to preserve a distinction nothing renders.

**`size` is bounded to a literal set** (`ITEM_PAGE_SIZES`), because
`itemSearchSchema` is what `GET /api/v1/items` parses as well as what the route
validates. Unbounded it is a way to pull the whole table in one query, from a
URL. The schema also carries **no per-field `.catch`**: the `/items` route wraps
the whole of it in one, so a malformed search param falls the UI back to the
defaults wholesale while REST still answers 400. Per-field catches would quietly
repair an API request instead of rejecting it.

**The `/items` layout route owns the search schema and the loader**, and both
page routes beneath it render `ItemList` off that one loader's data — which is
what lets `/items/new` be the same table with a row in it. It is also where
`ssr: "data-only"` sits; see "React" below for why that is load-bearing.

**`/items/new` redirects `status=complete` to `status=incomplete` in
`beforeLoad`, and the rule belongs to the route rather than to whatever linked
there.** A new item is always incomplete, so creating one under the Complete
filter would drop it straight out of view. The nav cannot express this: a
`NavItem`'s `search` is a static record read by both the active-match and the
link merge, so a rule that depends on the _current_ search has nowhere to live
there. On the route it covers the toolbar button, the sub-nav link, a typed URL
and a bookmark with one implementation. It carries `replace: true`, and that is
load-bearing rather than tidy — without it, Back re-enters the redirecting URL
and is bounced forward again, which is a trap with no way out.

**`src/features/items/rpc.ts` exports the server functions and nothing else.**
It re-exported `@/features/items/shared/schemas/items` so that
`@/features/items` resolved to one entry point for consumers; that was removed.
Re-exporting made the file an aggregation point as well as a boundary, which is
what made it read as a barrel, and it meant the service had to import the schema
module directly to avoid an import cycle through a file it has no other reason
to touch. Consumers import schemas and types from
`@/features/items/shared/schemas/items` by their real path — `ItemRow` takes
`Item` from there and the `/items` layout route takes `itemSearchSchema` from
there while taking `list` from `rpc.ts`. Two imports where there was one, and no
cycle possible in either direction.

## The screen

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

**Escape is one step in a rename and two in the blank row**, and the asymmetry
is the argument for it: abandoning a rename leaves the original name on screen,
while what is typed into the new-item row is its only copy. So `ItemRow` cancels
outright, and `NewItemRow` clears a field that has content and only cancels the
creation — a navigation back to `/items` — from an empty one. It tests
`name.length`, not `name.trim().length`; a field holding only spaces is content
the user can see the cursor past.

**Deleting is not confirmed, and that is the design.** There is no modal: the
row's delete button deletes, and the undo toast below is the safety net. A
confirmation dialog and an undo both answer the same question, and shipping both
asks the user to think twice about something already reversible. `useDeleteItem`
holds the request, the failure message, the invalidate and the toast, and takes
the **caller's** `run` rather than owning a `useAsyncAction`, because `ItemRow`
deliberately drives four controls off a single `pending`.

**Deleting a _backup_ is the exception, and it is confirmed.** The undo toast is
what makes an unconfirmed delete safe, and it cannot exist for a file: once the
archive is gone there is nothing to put back. A modal is the substitute, not a
second opinion about the items pattern.

**A toast outlives whatever raised it, so it reports its own outcome.** The row
unmounts the moment a delete lands, and a `setError` into a component that is
gone is a silent no-op that React 19 does not even warn about. `undoDelete` is
therefore module scope and writes its own failure back into the toast. There is
**one toast per delete**, carrying the offer, the in-flight state and the
outcome in turn, replaced in place by id: that is what makes a second click
structurally impossible while the first is in flight, and what keeps a failure
from destroying the retry affordance its own message tells the user to reach
for.

**All three of its states are one `UndoToast`**
(`src/features/items/client/components/UndoToast.tsx`) — the offer, the restore
in flight, and the failure that puts the offer back — with `onRestore` the only
thing that separates them, so the in-flight state omits the button rather than
disabling it. Its layout is what keeps the control readable: the message takes
`min-width: 0` and `overflow-wrap: anywhere`, and the button takes
`flex="0 0 auto"`. **Neither is cosmetic.** A flex item refuses to shrink below
its content by default, so the message wins the contest and squeezes the button
— and Mantine's `Button` clips its own label, so a squeezed one renders `Res`
while its accessible name stays `Restore` and every assertion about it passes.
Names run to the schema's 100-character cap with no space required in them,
which is what the mid-word wrapping is for. An e2e case measures the label's
`scrollWidth` against its `clientWidth`, because nothing about the accessibility
tree can see this.

**Undo is a re-add, not a restore** — new id, fresh `createdAt`, restamped
`completedAt`, with `completed` surviving only because it is passed back. A true
restore means a `deletedAt` column and a filter on every query, which is a
domain decision rather than a bug in this one.

**`ItemTime` has no ticker**, and the relative text is computed at render. Every
mutation invalidates the loader and re-renders it, so it is never more stale
than the data beside it. A clock that updated on its own would be
`useSyncExternalStore` over one shared interval — one subscription for the page,
not a timer per row — and is deliberately not built.
