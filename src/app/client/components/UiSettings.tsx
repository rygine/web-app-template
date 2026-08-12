import { Stack } from "@mantine/core";
import { getRouteApi } from "@tanstack/react-router";

import { SettingsDates } from "@/app/client/components/SettingsDates";
import { SettingsStyle } from "@/app/client/components/SettingsStyle";
import { UnsavedChangesModal } from "@/app/client/components/UnsavedChangesModal";
import { useSettingsForm } from "@/app/client/hooks/useSettingsForm";
import { ContentLayout } from "@/app/client/layouts/ContentLayout";

const route = getRouteApi("/settings");

export const UiSettings = () => {
  const { settings } = route.useLoaderData();
  const { commitNow, blocker } = useSettingsForm();

  return (
    <ContentLayout title="Settings">
      <Stack gap="xl">
        <SettingsDates settings={settings} commitNow={commitNow} />
        <SettingsStyle />
      </Stack>
      <UnsavedChangesModal blocker={blocker} />
    </ContentLayout>
  );
};
