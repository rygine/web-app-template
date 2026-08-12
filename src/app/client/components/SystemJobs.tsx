import { Stack, Text, Title } from "@mantine/core";
import { getRouteApi, useRouter } from "@tanstack/react-router";

import { JobRunsTable } from "@/app/client/components/JobRunsTable";
import { JobScheduleTable } from "@/app/client/components/JobScheduleTable";
import { useAsyncAction } from "@/app/client/hooks/useAsyncAction";
import { ContentLayout } from "@/app/client/layouts/ContentLayout";
import { runJobNow } from "@/app/rpc";

const route = getRouteApi("/system/jobs");

export const SystemJobs = () => {
  const { jobs, history } = route.useLoaderData();
  const router = useRouter();
  const { pending, run } = useAsyncAction({ toast: true });

  const handleRun = (name: string) =>
    void run(async () => {
      await runJobNow({ data: { name } });
      await router.invalidate();
    }, "Could not run that job.");

  return (
    <ContentLayout title="System">
      <Stack gap="xl">
        <Stack gap="xs">
          <Title order={2} size="h4">
            Schedule
          </Title>
          <Text size="sm" c="dimmed">
            A run started here takes the same lock a scheduled one does, so the
            two cannot collide. Hover a time to see the exact moment.
          </Text>
          <JobScheduleTable jobs={jobs} onRun={handleRun} pending={pending} />
        </Stack>

        <Stack gap="xs">
          <Title order={2} size="h4">
            History
          </Title>
          <JobRunsTable history={history} jobs={jobs} />
        </Stack>
      </Stack>
    </ContentLayout>
  );
};
