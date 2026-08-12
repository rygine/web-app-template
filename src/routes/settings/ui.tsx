import { createFileRoute } from "@tanstack/react-router";

import { UiSettings } from "@/app/client/components/UiSettings";

export const Route = createFileRoute("/settings/ui")({
  component: UiSettings,
});
