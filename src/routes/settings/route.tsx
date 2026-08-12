import { Outlet, createFileRoute } from "@tanstack/react-router";

import { getSettingsPage } from "@/app/rpc";

export const Route = createFileRoute("/settings")({
  // The theme control shows the viewer's stored colour-scheme preference, which
  // lives in localStorage and is unknowable on the server — rendering it during
  // SSR is a guaranteed hydration mismatch. Same escape hatch /items uses for
  // the ambient locale, for the same class of reason.
  ssr: "data-only",
  loader: () => getSettingsPage(),
  component: Outlet,
});
