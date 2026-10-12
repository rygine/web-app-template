import { createFileRoute } from "@tanstack/react-router";

import { SystemBackups } from "@/app/client/components/SystemBackups";
import { getBackupsPage } from "@/app/rpc";

export const Route = createFileRoute("/system/backups")({
  loader: () => getBackupsPage(),
  component: SystemBackups,
});
