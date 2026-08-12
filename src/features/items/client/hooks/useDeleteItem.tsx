import { notifications } from "@mantine/notifications";
import { useRouter } from "@tanstack/react-router";

import type { useAsyncAction } from "@/app/client/hooks/useAsyncAction";
import { timedToast } from "@/app/client/utils/toast";
import { failureMessage } from "@/app/shared/utils/errors";
import { createLogger } from "@/app/shared/utils/log";
import { UndoToast } from "@/features/items/client/components/UndoToast";
import { create, remove } from "@/features/items/rpc";
import type { Item } from "@/features/items/shared/schemas/items";

const log = createLogger("ui");

const undoId = (item: Item) => `undo-delete-${item.id}`;

type Run = ReturnType<typeof useAsyncAction>["run"];

// One toast per delete, from the offer through to the outcome, so the Restore
// button is on screen exactly when pressing it is possible. Replacing the
// contents in place is what makes a second click structurally impossible while
// the first is in flight, and what keeps a failure from destroying the retry
// affordance its own message tells the user to reach for.
//
// Undo is a re-add, not a restore: a new id, a fresh `createdAt`, and a
// restamped `completedAt`. `completed` is carried across so undoing a done item
// does not hand back an undone one.
const undoDelete = async (item: Item, invalidate: () => Promise<void>) => {
  const id = undoId(item);
  const retry = () => void undoDelete(item, invalidate);

  notifications.update({
    id,
    loading: true,
    // Neither the close button, a swipe, nor the clock can take the toast away
    // mid-flight, so the outcome below always has something to write into. The
    // countdown goes with the message it was part of, which is what an update
    // replaces outright.
    allowClose: false,
    autoClose: false,
    message: (
      <UndoToast message={<>Restoring &ldquo;{item.name}&rdquo;&hellip;</>} />
    ),
  });

  try {
    await create({ data: { name: item.name, completed: item.completed } });
    await invalidate();
    notifications.hide(id);
  } catch (caught) {
    log.error("undoDelete: restore failed", { id: item.id, error: caught });
    notifications.update({
      id,
      color: "red",
      loading: false,
      allowClose: true,
      // The one toast whose disappearance loses data: the item is gone and this
      // button is the only way back, so no timer and no countdown.
      autoClose: false,
      message: (
        <UndoToast
          // Composed the way `useAsyncAction` composes its own, so a reason the
          // server wrote for a person reaches the toast rather than being
          // replaced by generic advice.
          message={failureMessage("Could not restore the item.", caught)}
          onRestore={retry}
        />
      ),
    });
  }
};

// The one delete path. It takes the caller's `run` rather than owning a
// `useAsyncAction`, so the call site keeps the single per-item pending slot it
// already renders.
export const useDeleteItem = (run: Run) => {
  const router = useRouter();
  const invalidate = () => router.invalidate();

  return (item: Item) =>
    run(async () => {
      await remove({ data: item.id });
      await invalidate();
      notifications.show(
        timedToast({
          id: undoId(item),
          closeButtonProps: { "aria-label": "Dismiss notification" },
          message: (
            <UndoToast
              message={<>Deleted &ldquo;{item.name}&rdquo;</>}
              onRestore={() => void undoDelete(item, invalidate)}
            />
          ),
        }),
      );
    }, "Could not delete the item.");
};
