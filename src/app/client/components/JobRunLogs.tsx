import { Code, Modal, Text } from "@mantine/core";

import type { JobLogLine } from "@/app/shared/schemas/jobs";
import { formatLine } from "@/app/shared/utils/log";

import classes from "./JobRunLogs.module.css";

export const JobRunLogs = ({
  runId,
  lines,
  total,
  onClose,
}: {
  runId: string;
  lines: JobLogLine[];
  total: number;
  onClose: () => void;
}) => (
  <Modal
    opened
    centered
    onClose={onClose}
    title={`Run ${runId}`}
    size="80rem"
    closeButtonProps={{ "aria-label": "Close the logs" }}
    classNames={{ content: classes.content }}>
    {lines.length === 0 ? (
      <Text size="sm" c="dimmed">
        No log entries survive for this run — archiving moves them to a file
        once they age out.
      </Text>
    ) : (
      <>
        {total > lines.length && (
          <Text size="sm" c="dimmed" mb="xs">
            Showing the first {lines.length} of {total} lines.
          </Text>
        )}
        <Code block className={classes.log}>
          {lines.map((line) => formatLine(line)).join("\n")}
        </Code>
      </>
    )}
  </Modal>
);
