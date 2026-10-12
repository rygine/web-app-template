import { randomId } from "@mantine/hooks";
import { notifications } from "@mantine/notifications";
import type { NotificationData } from "@mantine/notifications";

import { CountdownToast } from "@/app/client/components/CountdownToast";
import { failureMessage } from "@/app/shared/utils/errors";
import { createLogger } from "@/app/shared/utils/log";

const log = createLogger("ui");

// the one duration of every timed toast
const TOAST_TIMEOUT = 8000;

// the live toast id for each failure message
const liveErrors = new Map<string, string>();

// The only way to raise a toast with a countdown.
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

// A repeat of a message on screen replaces its toast.
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

// Logs a caught failure, raises it as a toast unless the hook opts out, and returns the sentence.
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
