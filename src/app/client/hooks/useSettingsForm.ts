import { useBlocker, useRouter } from "@tanstack/react-router";

import { useAutosave } from "@/app/client/hooks/useAutosave";
import { updateSettings } from "@/app/rpc";
import type { Settings } from "@/app/shared/schemas/settings";

// One autosave and one blocker per settings page.
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
    enableBeforeUnload: () => dirty,
    withResolver: true,
  });

  return { commit, commitNow, flush, blocker };
};
