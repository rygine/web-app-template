import { Outlet, createFileRoute } from "@tanstack/react-router";

import { getSystem } from "@/app/rpc";

export const Route = createFileRoute("/system")({
  // Uptime and timestamps use the viewer's clock and locale.
  ssr: "data-only",
  loader: () => getSystem(),
  component: Outlet,
});
