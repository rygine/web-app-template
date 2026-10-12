import { useState } from "react";

import { reportFailure } from "@/app/client/utils/toast";
import { createLogger } from "@/app/shared/utils/log";

const log = createLogger("ui");

// `toast` is opt-in rather than the default: a screen with one control and a
// field to hang the message on renders `error` inline instead, which is what
// `Settings` does. `error` is returned either way, so opting in is additive.
export const useAsyncAction = ({ toast = false }: { toast?: boolean } = {}) => {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async (action: () => Promise<void>, message: string) => {
    setPending(true);
    setError(null);
    log.trace("useAsyncAction: action started", { reason: message });
    try {
      await action();
      log.trace("useAsyncAction: action succeeded", { reason: message });
    } catch (caught) {
      // Raised here rather than at the call site: the failure is only knowable
      // the moment it happens, and a call site reacting to `error` in render
      // would be the effect this codebase does not write.
      setError(reportFailure(message, caught, { toast }));
    } finally {
      setPending(false);
    }
  };

  return { pending, error, run };
};
