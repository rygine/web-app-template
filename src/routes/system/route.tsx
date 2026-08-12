import { Outlet, createFileRoute } from "@tanstack/react-router";

import { getSystem } from "@/app/rpc";

export const Route = createFileRoute("/system")({
  // Uptime and timestamps are rendered against the viewer's own clock and
  // locale, which the server cannot know — the same reason /items and
  // /settings opt out.
  ssr: "data-only",
  loader: () => getSystem(),
  component: Outlet,
});
