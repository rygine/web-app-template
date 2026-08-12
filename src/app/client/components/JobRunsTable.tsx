import {
  Anchor,
  Group,
  SegmentedControl,
  Select,
  Stack,
  Table,
  Text,
} from "@mantine/core";
import { Link, getRouteApi } from "@tanstack/react-router";

import { JobStatusBadge } from "@/app/client/components/JobStatusBadge";
import { PageControls } from "@/app/client/components/PageControls";
import { useDateFormats } from "@/app/client/hooks/useDateFormats";
import { JOB_STATUS_LABELS } from "@/app/client/utils/jobStatus";
import {
  JOB_RUN_PAGE_SIZES,
  JOB_RUN_STATUSES,
} from "@/app/shared/schemas/jobs";
import type {
  JobRunPage,
  JobRunStatusFilter,
  JobView,
} from "@/app/shared/schemas/jobs";
import { formatDateTime } from "@/app/shared/utils/dates";
import { formatDuration, formatSince } from "@/app/shared/utils/format";

import classes from "./JobRunsTable.module.css";

const route = getRouteApi("/system/jobs");

const STATUS_OPTIONS: { value: JobRunStatusFilter; label: string }[] = [
  { value: "all", label: "All" },
  ...JOB_RUN_STATUSES.map((status) => ({
    value: status,
    label: JOB_STATUS_LABELS[status],
  })),
];

export const JobRunsTable = ({
  history,
  jobs,
}: {
  history: JobRunPage;
  jobs: JobView[];
}) => {
  const { page, size, job, status } = route.useSearch();
  const navigate = route.useNavigate();
  const formats = useDateFormats();

  const titleOf = (name: string) =>
    jobs.find((entry) => entry.name === name)?.title ?? name;

  return (
    <Stack>
      <Group justify="space-between" wrap="wrap">
        <SegmentedControl
          color="var(--mantine-primary-color-filled)"
          aria-label="Filter by result"
          value={status}
          data={STATUS_OPTIONS}
          onChange={(next) => {
            void navigate({
              search: (prev) => ({ ...prev, status: next, page: 1 }),
            });
          }}
        />
        <Select
          aria-label="Filter by job"
          classNames={{ root: classes.jobFilter }}
          value={job}
          allowDeselect={false}
          data={[
            { value: "all", label: "All jobs" },
            ...jobs.map((entry) => ({ value: entry.name, label: entry.title })),
          ]}
          onChange={(next) => {
            if (next !== null) {
              void navigate({
                search: (prev) => ({ ...prev, job: next, page: 1 }),
              });
            }
          }}
        />
      </Group>

      <PageControls
        page={page}
        size={size}
        sizes={JOB_RUN_PAGE_SIZES}
        count={history.runs.length}
        total={history.total}
        pageCount={history.pageCount}
        label="Run pagination"
        onPage={(next) => {
          void navigate({ search: (prev) => ({ ...prev, page: next }) });
        }}
        onSize={(next) => {
          void navigate({
            search: (prev) => ({ ...prev, size: next, page: 1 }),
          });
        }}>
        <Table aria-label="Run history">
          <Table.Thead>
            <Table.Tr>
              <Table.Th className={classes.jobColumn}>Job</Table.Th>
              <Table.Th className={classes.metaColumn}>Started</Table.Th>
              <Table.Th className={classes.resultColumn}>Result</Table.Th>
              <Table.Th className={classes.metaColumn}>Took</Table.Th>
              <Table.Th className={classes.metaColumn}>Logs</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {history.runs.map((entry) => (
              <Table.Tr key={entry.id}>
                <Table.Td className={classes.jobColumn}>
                  <Text size="sm" truncate>
                    {titleOf(entry.name)}
                  </Text>
                </Table.Td>
                <Table.Td className={classes.metaColumn}>
                  <Text
                    size="sm"
                    title={formatDateTime(formats, entry.startedAt)}>
                    {formatSince(entry.startedAt)}
                  </Text>
                </Table.Td>
                <Table.Td className={classes.resultColumn}>
                  <JobStatusBadge status={entry.status} />
                </Table.Td>
                <Table.Td className={classes.metaColumn}>
                  <Text size="sm">{formatDuration(entry.durationMs)}</Text>
                </Table.Td>
                <Table.Td className={classes.metaColumn}>
                  {/* A link, not a disclosure: the logs are a route, so a run
                      has its own URL and the filters behind it survive. */}
                  <Anchor
                    size="sm"
                    aria-label={`Logs for run ${entry.id}`}
                    renderRoot={(props) => (
                      <Link
                        {...props}
                        to="/system/jobs/$runId"
                        params={{ runId: String(entry.id) }}
                        search={(prev) => prev}
                      />
                    )}>
                    Show
                  </Anchor>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>

        {history.runs.length === 0 && (
          <Text size="sm" c="dimmed">
            No runs match these filters.
          </Text>
        )}
      </PageControls>
    </Stack>
  );
};
