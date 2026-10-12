import { createFileRoute } from "@tanstack/react-router";

import { SettingsBackups } from "@/app/client/components/SettingsBackups";
import { SettingsPage } from "@/app/client/components/SettingsPage";

const BackupsPage = () => (
  <SettingsPage title="Backups">
    {({ settings, commit }) => (
      <SettingsBackups settings={settings} commit={commit} />
    )}
  </SettingsPage>
);

export const Route = createFileRoute("/settings/backups")({
  component: BackupsPage,
});
