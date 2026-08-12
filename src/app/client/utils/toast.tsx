import { randomId } from "@mantine/hooks";
import { notifications } from "@mantine/notifications";
import type { NotificationData } from "@mantine/notifications";

import { CountdownToast } from "@/app/client/components/CountdownToast";
import { failureMessage } from "@/app/shared/utils/errors";
import { createLogger } from "@/app/shared/utils/log";

const log = createLogger("ui");

// Long enough to notice and reach, short enough that a stack of them does not
// accumulate. One window for every timed toast in the app.
const TOAST_TIMEOUT = 8000;

// The live toast for each failure message, keyed by the message itself: two
// different failures are two toasts, the same failure twice is one.
const liveErrors = new Map<string, string>();

// The only way to raise a toast with a countdown, so the bar and the timer come
// from the same constant and cannot drift. `autoClose` is taken off the input
// for that reason: there is no second duration to pass.
//
// A toast that must not close itself skips this and goes to `notifications`
// directly, which is how it ends up with no bar. The undo-failure toast is the
// one: the item is already deleted and its Restore button is the only way back,
// so nothing may take it off screen and nothing may suggest something will.
export const timedToast = (
  data: Omit<NotificationData, "autoClose">,
): NotificationData => ({
  ...data,
  autoClose: TOAST_TIMEOUT,
  message: (
    <CountdownToast duration={TOAST_TIMEOUT} color={data.color}>
      {data.message}
    </CountdownToast>
  ),
});

// Retrying a failing action three times is one piece of news, not three, so a
// repeat replaces the toast on screen. It hides the old one and shows a new id
// rather than reusing one: `notifications.show` drops a duplicate id outright,
// and `update` merges into the mounted element, which restarts neither the CSS
// countdown nor Mantine's auto-close timer. Only a fresh mount does both, and
// the second failure is the newer news.
export const showErrorToast = (message: string) => {
  const live = liveErrors.get(message);
  if (live !== undefined) {
    notifications.hide(live);
  }

  const id = randomId();
  liveErrors.set(message, id);
  notifications.show(
    timedToast({
      id,
      color: "red",
      message,
      onClose: () => {
        liveErrors.delete(message);
      },
    }),
  );
};

// The one place a caught failure is logged, composed into a sentence, and
// raised, so every hook reports identically. Returns the sentence for inline
// rendering; `toast` is the hook's opt-in.
export const reportFailure = (
  message: string,
  caught: unknown,
  { toast = true }: { toast?: boolean } = {},
): string => {
  log.error("reportFailure: action failed", { reason: message, error: caught });
  const reported = failureMessage(message, caught);
  if (toast) {
    showErrorToast(reported);
  }
  return reported;
};
