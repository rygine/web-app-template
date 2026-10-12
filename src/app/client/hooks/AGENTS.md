# Hooks

Reasoning behind `useSettingsForm`, `useAsyncAction`, and `useModalItem`. The
rules are in the root `AGENTS.md`; this is why they hold.

## Autosave

**There is no Save button anywhere on the settings screen**, and the two write
paths are not interchangeable:

- **`commit`** debounces (`AUTOSAVE_DELAY`, 400ms) and coalesces. It is for
  typing.
- **`commitNow`** writes at once. It is for a `Select` or a `Switch`, where no
  further input is coming and a pause only widens the window in which a reload
  loses the change. Both were needed: driving a discrete control off loader data
  alone left it showing the old value until the write and the loader round trip
  completed, which is visible as a control that does not answer its own click.

**Every editable control holds its own value in `useState` seeded from the
loader**, for that same reason. The loader is the source of truth on mount and
after an invalidate; the local value is what the user is looking at in between.

**A failed write puts its patch back on the queue**, so the edit is never lost
and the next flush retries it. `dirty` stays true until a write succeeds.

**The one lossy window is a reload during the debounce**, and
`enableBeforeUnload` is the whole of the protection — a real browser asks before
discarding it, and Playwright dismisses that prompt automatically, so an e2e
case that reloads has to wait for the write rather than assume it landed.

**Writes run one at a time.** `flush` chains onto the write in flight, so a
later patch never lands before an earlier one, and a flush resolves only after
every write queued before it has landed. `dirty` stays true while a write lands
if an edit was queued behind it.

**Navigation blocking flushes before it decides.** `useSettingsForm`'s
`shouldBlockFn` is `async () => !(await flush())`, so leaving with an ordinary
pending edit writes it and proceeds, and only a **failed** write raises the
modal. `enableBeforeUnload` is the exception — a closing tab cannot wait for a
write, so it asks on any pending edit. `useBlocker` registers its own
`beforeunload` listener; that is why no `useEffect` appears here despite the
ban.

## Failures reach the user as toasts

**`reportFailure` (`src/app/client/utils/toast.tsx`) is the one place a caught
failure is logged, composed into a sentence, and raised**, so every hook reports
it the same way.

**Failures reach the user as toasts, opted into at the hook.**
`useAsyncAction({ toast: true })` raises one from its own `catch`;
`SystemBackups` and `ItemRow` opt in, `SettingsSecurity` keeps the default and
renders the returned `error` inline beside its one control. The hook is where it
belongs because a failure is only knowable at the instant it happens: `run`
swallows the rejection and reports through state, so a call site could only
react to `error` during render, which is an effect in all but name. A row is the
wrong place for the message anyway — it is too small to hold one, and the row
for a delete has unmounted by the time one arrives. `error` is returned either
way, so opting in is additive, and a unit case asserts the default raises
nothing.

## Modals opened for an item

**`useModalItem` keeps a modal's item until Mantine's `onExitTransitionEnd`.**
Mantine animates a modal out after `opened` turns false, so a title or body
derived from state cleared on close renders blank for the length of the
animation. The hook holds `opened` and the item apart: closing clears the first,
the end of the exit transition clears the second. Every modal whose title or
body shows its item uses it, such as the backup delete confirmation. A modal
mounted only while its item exists (`JobRunLogs`) unmounts with no exit
animation and does not need it.
