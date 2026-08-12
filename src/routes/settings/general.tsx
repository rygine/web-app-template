import { createFileRoute } from "@tanstack/react-router";

import { GeneralSettings } from "@/app/client/components/GeneralSettings";

export const Route = createFileRoute("/settings/general")({
  component: GeneralSettings,
});
