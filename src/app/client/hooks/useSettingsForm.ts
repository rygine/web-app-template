import { useBlocker, useRouter } from "@tanstack/react-router";

import { useAutosave } from "@/app/client/hooks/useAutosave";
import { updateSettings } from "@/app/rpc";
import type { Settings } from "@/app/shared/schemas/settings";

// One autosave and one blocker per settings page. Leaving flushes first and
// blocks only if that write fails, so an ordinary edit followed by a click does
// not stop anyone — an unapplied change does.
export const useSettingsForm = () => {
  const router = useRouter();

  const { commit, commitNow, flush, dirty } = useAutosave<Settings>(
    async (patch) => {
      await updateSettings({ data: patch });
      await router.invalidate();
    },
    "Could not save the setting.",
  );

  const blocker = useBlocker({
    shouldBlockFn: async () => !(await flush()),
    // A closing tab cannot wait for a write, so this one asks on any pending
    // edit rather than only on a failed one.
    enableBeforeUnload: () => dirty,
    withResolver: true,
  });

  return { commit, commitNow, blocker };
};
