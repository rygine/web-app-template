import { createFileRoute } from "@tanstack/react-router";

import { SystemStatus } from "@/app/client/components/SystemStatus";

export const Route = createFileRoute("/system/")({
  component: SystemStatus,
});
