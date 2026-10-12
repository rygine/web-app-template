import { Outlet, createFileRoute } from "@tanstack/react-router";

import { SystemJobs } from "@/app/client/components/SystemJobs";
import { getJobsPage } from "@/app/rpc";
import { jobRunSearchSchema } from "@/app/shared/schemas/jobs";

export const Route = createFileRoute("/system/jobs")({
  // One catch around the whole schema, never per field: a malformed search
  // param falls back to the defaults wholesale.
  validateSearch: jobRunSearchSchema.catch(() => jobRunSearchSchema.parse({})),
  loaderDeps: ({ search }) => search,
  loader: ({ deps }) => getJobsPage({ data: deps }),
  // The panel is a sibling of the screen, not its child: feeding <Outlet/> to
  // the content and expecting the panel beside it is the obvious mistake and
  // does not work. See "The panel is opened by a route" in AGENTS.md.
  component: () => (
    <>
      <SystemJobs />
      <Outlet />
    </>
  ),
});
