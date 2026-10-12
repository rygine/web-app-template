import { createFileRoute } from "@tanstack/react-router";

import { SettingsPage } from "@/app/client/components/SettingsPage";
import { SettingsSecurity } from "@/app/client/components/SettingsSecurity";

const SecurityPage = () => (
  <SettingsPage title="Security">
    {({ settings, commitNow }) => (
      <SettingsSecurity settings={settings} commitNow={commitNow} />
    )}
  </SettingsPage>
);

export const Route = createFileRoute("/settings/security")({
  component: SecurityPage,
});
