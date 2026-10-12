import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/settings/")({
  // replace: true, or Back re-enters this URL and is bounced forward again.
  beforeLoad: () => {
    throw redirect({ to: "/settings/general", replace: true });
  },
});
