import { Outlet, createFileRoute } from "@tanstack/react-router";

import { getSettingsPage } from "@/app/rpc";

export const Route = createFileRoute("/settings")({
  // The theme control reads localStorage, which the server cannot see.
  ssr: "data-only",
  loader: () => getSettingsPage(),
  component: Outlet,
});
