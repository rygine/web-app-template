import { Divider, Stack } from "@mantine/core";
import { createFileRoute } from "@tanstack/react-router";

import { SettingsHost } from "@/app/client/components/SettingsHost";
import { SettingsLogging } from "@/app/client/components/SettingsLogging";
import { SettingsPage } from "@/app/client/components/SettingsPage";

const GeneralPage = () => (
  <SettingsPage title="General">
    {({ settings, runtime, commit, commitNow }) => (
      <Stack gap="xl">
        <SettingsHost settings={settings} runtime={runtime} commit={commit} />
        <Divider />
        <SettingsLogging
          settings={settings}
          runtime={runtime}
          commitNow={commitNow}
        />
      </Stack>
    )}
  </SettingsPage>
);

export const Route = createFileRoute("/settings/general")({
  component: GeneralPage,
});
