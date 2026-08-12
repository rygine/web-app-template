import { Badge, Text } from "@mantine/core";

import { JOB_STATUS_LABELS } from "@/app/client/utils/jobStatus";
import type { JobRunStatus } from "@/app/shared/schemas/jobs";

import classes from "./JobStatusBadge.module.css";

const COLOURS: Record<JobRunStatus, string> = {
  succeeded: "green",
  failed: "red",
  running: "blue",
  interrupted: "yellow",
};

export const JobStatusBadge = ({ status }: { status: JobRunStatus | null }) => {
  if (status === null) {
    return (
      <Text size="sm" c="dimmed">
        —
      </Text>
    );
  }

  return (
    <Badge
      color={COLOURS[status]}
      variant="light"
      radius="sm"
      classNames={{ root: classes.root, label: classes.label }}>
      {JOB_STATUS_LABELS[status]}
    </Badge>
  );
};
