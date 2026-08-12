import {
  Button,
  Progress,
  Stack,
  Table,
  Text,
  VisuallyHidden,
} from "@mantine/core";

import { JobStatusBadge } from "@/app/client/components/JobStatusBadge";
import { useDateFormats } from "@/app/client/hooks/useDateFormats";
import type { JobView } from "@/app/shared/schemas/jobs";
import { formatDateTime } from "@/app/shared/utils/dates";
import { formatInterval, formatSince } from "@/app/shared/utils/format";

import classes from "./JobScheduleTable.module.css";

const When = ({ date, fallback }: { date: Date | null; fallback: string }) => {
  const formats = useDateFormats();
  return date === null ? (
    <Text size="sm">{fallback}</Text>
  ) : (
    <Text size="sm" title={formatDateTime(formats, date)}>
      {formatSince(date)}
    </Text>
  );
};

export const JobScheduleTable = ({
  jobs,
  onRun,
  pending,
}: {
  jobs: JobView[];
  onRun: (name: string) => void;
  pending: boolean;
}) => (
  <Table aria-label="Schedule">
    <Table.Thead>
      <Table.Tr>
        <Table.Th className={classes.jobColumn}>Job</Table.Th>
        <Table.Th className={classes.metaColumn}>Frequency</Table.Th>
        <Table.Th className={classes.metaColumn}>Last run</Table.Th>
        <Table.Th className={classes.resultColumn}>Result</Table.Th>
        <Table.Th className={classes.metaColumn}>Next run</Table.Th>
        <Table.Th className={classes.actionsColumn}>
          <VisuallyHidden>Actions</VisuallyHidden>
        </Table.Th>
      </Table.Tr>
    </Table.Thead>
    <Table.Tbody>
      {jobs.map((job) => (
        <Table.Tr key={job.name}>
          <Table.Td className={classes.jobColumn}>
            <Stack gap={2}>
              <Text size="sm" truncate>
                {job.title}
              </Text>
              {job.running !== null && job.running.progress !== null && (
                <Progress value={job.running.progress} size="xs" />
              )}
            </Stack>
          </Table.Td>
          <Table.Td className={classes.metaColumn}>
            <Text size="sm">{formatInterval(job.intervalMs)}</Text>
          </Table.Td>
          <Table.Td className={classes.metaColumn}>
            <When date={job.last?.startedAt ?? null} fallback="Never" />
          </Table.Td>
          <Table.Td className={classes.resultColumn}>
            <JobStatusBadge status={job.last?.status ?? null} />
          </Table.Td>
          <Table.Td className={classes.metaColumn}>
            {job.running !== null ? (
              <Text size="sm">{job.running.note ?? "Running now"}</Text>
            ) : (
              <When date={job.nextDueAt} fallback="Due now" />
            )}
          </Table.Td>
          <Table.Td className={classes.actionsColumn}>
            <Button
              size="xs"
              variant="default"
              aria-label={`Run ${job.title} now`}
              loading={pending || job.running !== null}
              onClick={() => onRun(job.name)}>
              Run now
            </Button>
          </Table.Td>
        </Table.Tr>
      ))}
    </Table.Tbody>
  </Table>
);
