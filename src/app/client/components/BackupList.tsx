import {
  ActionIcon,
  Anchor,
  Button,
  Group,
  Modal,
  Stack,
  Table,
  Text,
  VisuallyHidden,
} from "@mantine/core";
import { TrashIcon } from "@phosphor-icons/react/Trash";
import { useState } from "react";

import { useDateFormats } from "@/app/client/hooks/useDateFormats";
import type { BackupFile } from "@/app/shared/schemas/backups";
import { formatDateTime } from "@/app/shared/utils/dates";
import { formatBytes } from "@/app/shared/utils/format";

import classes from "./BackupList.module.css";

export const BackupList = ({
  files,
  onDelete,
  pending,
}: {
  files: BackupFile[];
  onDelete: (name: string) => void;
  pending: boolean;
}) => {
  const [confirming, setConfirming] = useState<string | null>(null);
  const formats = useDateFormats();

  if (files.length === 0) {
    return (
      <Text size="sm" c="dimmed">
        No backups yet.
      </Text>
    );
  }

  return (
    <>
      <Table>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Backup</Table.Th>
            <Table.Th>Taken</Table.Th>
            <Table.Th>Size</Table.Th>
            <Table.Th className={classes.actionsColumn}>
              <VisuallyHidden>Actions</VisuallyHidden>
            </Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {files.map((file) => (
            <Table.Tr key={file.name}>
              <Table.Td>
                {/* A real link, not a fetch-and-blob: the route streams, so an
                    archive larger than memory still downloads. */}
                <Anchor href={`/backups/${file.name}`} download size="sm">
                  {file.name}
                </Anchor>
              </Table.Td>
              <Table.Td>
                <Text size="sm">{formatDateTime(formats, file.createdAt)}</Text>
              </Table.Td>
              <Table.Td>
                <Text size="sm">{formatBytes(file.size)}</Text>
              </Table.Td>
              <Table.Td className={classes.actionsColumn}>
                <ActionIcon
                  variant="subtle"
                  color="red"
                  aria-label={`Delete ${file.name}`}
                  onClick={() => setConfirming(file.name)}>
                  <TrashIcon size={16} />
                </ActionIcon>
              </Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>

      <Modal
        opened={confirming !== null}
        onClose={() => setConfirming(null)}
        title="Delete this backup?"
        centered>
        <Stack>
          <Text size="sm">
            {confirming} will be removed from disk. This cannot be undone.
          </Text>
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setConfirming(null)}>
              Keep it
            </Button>
            <Button
              color="red"
              loading={pending}
              onClick={() => {
                if (confirming !== null) {
                  onDelete(confirming);
                }
                setConfirming(null);
              }}>
              Delete
            </Button>
          </Group>
        </Stack>
      </Modal>
    </>
  );
};
