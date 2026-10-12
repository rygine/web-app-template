import { createFileRoute } from "@tanstack/react-router";

import { JobRunLogs } from "@/app/client/components/JobRunLogs";
import { getJobRunLogs } from "@/app/rpc";

// eslint-disable-next-line react/only-export-components
const RunPanel = () => {
  const navigate = Route.useNavigate();

  const { lines, total } = Route.useLoaderData();

  return (
    <JobRunLogs
      runId={Route.useParams().runId}
      lines={lines}
      total={total}
      onClose={() => {
        void navigate({ to: "/system/jobs", search: (prev) => prev });
      }}
    />
  );
};

export const Route = createFileRoute("/system/jobs/$runId")({
  loader: ({ params }) => getJobRunLogs({ data: { id: Number(params.runId) } }),
  component: RunPanel,
});
