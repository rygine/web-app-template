import { createFileRoute } from "@tanstack/react-router";

import { SetupPage } from "@/app/client/components/SetupPage";

export const Route = createFileRoute("/setup")({
  component: SetupPage,
});
