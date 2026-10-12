import { createFileRoute } from "@tanstack/react-router";

import { SystemLogs } from "@/app/client/components/SystemLogs";
import { getLogsPage } from "@/app/rpc";
import { logSearchSchema } from "@/app/shared/schemas/logs";

export const Route = createFileRoute("/system/logs")({
  validateSearch: logSearchSchema.catch(() => logSearchSchema.parse({})),
  loaderDeps: ({ search }) => search,
  loader: ({ deps }) => getLogsPage({ data: deps }),
  component: SystemLogs,
});
