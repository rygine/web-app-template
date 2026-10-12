import {
  ActionIcon,
  Button,
  Code,
  Group,
  Modal,
  Stack,
  Table,
  Text,
  Tooltip,
  VisuallyHidden,
} from "@mantine/core";
import { ArrowCounterClockwiseIcon } from "@phosphor-icons/react/ArrowCounterClockwise";
import { DownloadSimpleIcon } from "@phosphor-icons/react/DownloadSimple";
import { TrashIcon } from "@phosphor-icons/react/Trash";

import { ConfirmDeleteModal } from "@/app/client/components/ConfirmDeleteModal";
import { useDateFormats } from "@/app/client/hooks/useDateFormats";
import { useModalItem } from "@/app/client/hooks/useModalItem";
import type { BackupFile } from "@/app/shared/schemas/backups";
import { formatDateTime } from "@/app/shared/utils/dates";
import { formatBytes } from "@/app/shared/utils/format";

import classes from "./BackupList.module.css";

export const BackupList = ({
  files,
  filtered,
  onDelete,
  onRestore,
  pending,
}: {
  files: BackupFile[];
  filtered: boolean;
  onDelete: (name: string) => Promise<void>;
  onRestore: (name: string) => void;
  pending: boolean;
}) => {
  const restoring = useModalItem<string>();
  const deleting = useModalItem<string>();
  const formats = useDateFormats();

  return (
    <>
      <Table aria-label="Backups" highlightOnHover verticalSpacing={4} fz="sm">
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Date</Table.Th>
            <Table.Th>Filename</Table.Th>
            <Table.Th className={classes.sizeColumn}>Size</Table.Th>
            <Table.Th className={classes.actionsColumn}>
              <VisuallyHidden>Actions</VisuallyHidden>
            </Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {files.length === 0 && (
            <Table.Tr>
              <Table.Td colSpan={4}>
                <Text size="sm" c="dimmed" ta="center">
                  {filtered
                    ? "No backups match this search."
                    : "No backups found. Create your first backup to get started."}
                </Text>
              </Table.Td>
            </Table.Tr>
          )}
          {files.map((file) => (
            <Table.Tr key={file.name}>
              <Table.Td>
                <Text size="sm" fw={500}>
                  {formatDateTime(formats, file.createdAt)}
                </Text>
              </Table.Td>
              <Table.Td>
                <Text size="sm" ff="monospace" c="dimmed">
                  {file.name}
                </Text>
              </Table.Td>
              <Table.Td className={classes.sizeColumn}>
                <Text size="sm" c="dimmed">
                  {formatBytes(file.size)}
                </Text>
              </Table.Td>
              <Table.Td className={classes.actionsColumn}>
                <Group gap={4} justify="center" wrap="nowrap">
                  <Tooltip label="Download">
                    {/* A real link, not a fetch-and-blob: the route streams. */}
                    <ActionIcon
                      component="a"
                      href={`/backups/${file.name}`}
                      download
                      variant="default"
                      size="sm"
                      aria-label={`Download ${file.name}`}>
                      <DownloadSimpleIcon />
                    </ActionIcon>
                  </Tooltip>
                  <Tooltip label="Restore">
                    <ActionIcon
                      variant="default"
                      size="sm"
                      aria-label={`Restore ${file.name}`}
                      onClick={() => restoring.open(file.name)}>
                      <ArrowCounterClockwiseIcon />
                    </ActionIcon>
                  </Tooltip>
                  <Tooltip label="Delete">
                    <ActionIcon
                      variant="default"
                      color="red"
                      c="red"
                      size="sm"
                      aria-label={`Delete ${file.name}`}
                      onClick={() => deleting.open(file.name)}>
                      <TrashIcon />
                    </ActionIcon>
                  </Tooltip>
                </Group>
              </Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>

      <Modal {...restoring.props} title="Restore backup" centered>
        <Stack>
          <Text size="sm">
            Every setting, instance, and catalog row is replaced with the
            contents of this backup. The current database is kept until the
            restored one answers a query.
          </Text>
          <Text size="xs" ff="monospace" c="dimmed">
            {restoring.item}
          </Text>
          <Group justify="flex-end">
            <Button variant="default" onClick={restoring.close}>
              Cancel
            </Button>
            <Button
              loading={pending}
              onClick={() => {
                if (restoring.item !== null) {
                  onRestore(restoring.item);
                }
                restoring.close();
              }}>
              Restore backup
            </Button>
          </Group>
        </Stack>
      </Modal>

      <ConfirmDeleteModal
        target={deleting}
        title="Delete backup"
        label="Delete backup"
        failure="Could not delete that backup."
        onDelete={onDelete}>
        <Code>{deleting.item}</Code> is removed from disk. This cannot be
        undone.
      </ConfirmDeleteModal>
    </>
  );
};
