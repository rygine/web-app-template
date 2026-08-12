import { Stack } from "@mantine/core";
import { getRouteApi } from "@tanstack/react-router";

import { SettingsHost } from "@/app/client/components/SettingsHost";
import { SettingsLogging } from "@/app/client/components/SettingsLogging";
import { SettingsSecurity } from "@/app/client/components/SettingsSecurity";
import { UnsavedChangesModal } from "@/app/client/components/UnsavedChangesModal";
import { useSettingsForm } from "@/app/client/hooks/useSettingsForm";
import { ContentLayout } from "@/app/client/layouts/ContentLayout";

const route = getRouteApi("/settings");

export const GeneralSettings = () => {
  const { settings, runtime } = route.useLoaderData();
  const { commit, commitNow, blocker } = useSettingsForm();

  return (
    <ContentLayout title="Settings">
      <Stack gap="xl">
        <SettingsHost settings={settings} runtime={runtime} commit={commit} />
        <SettingsSecurity />
        <SettingsLogging
          settings={settings}
          runtime={runtime}
          commitNow={commitNow}
        />
      </Stack>
      <UnsavedChangesModal blocker={blocker} />
    </ContentLayout>
  );
};
