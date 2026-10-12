import { Divider, Stack } from "@mantine/core";
import { createFileRoute } from "@tanstack/react-router";

import { SettingsDates } from "@/app/client/components/SettingsDates";
import { SettingsPage } from "@/app/client/components/SettingsPage";
import { SettingsStyle } from "@/app/client/components/SettingsStyle";

const UiPage = () => (
  <SettingsPage title="UI">
    {({ settings, commitNow }) => (
      <Stack gap="xl">
        <SettingsDates settings={settings} commitNow={commitNow} />
        <Divider />
        <SettingsStyle />
      </Stack>
    )}
  </SettingsPage>
);

export const Route = createFileRoute("/settings/ui")({
  component: UiPage,
});
