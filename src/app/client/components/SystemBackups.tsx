import {
  ActionIcon,
  Alert,
  Button,
  FileButton,
  Group,
  Modal,
  Stack,
  Text,
  TextInput,
  Tooltip,
} from "@mantine/core";
import { BroomIcon } from "@phosphor-icons/react/Broom";
import { FileArchiveIcon } from "@phosphor-icons/react/FileArchive";
import { MagnifyingGlassIcon } from "@phosphor-icons/react/MagnifyingGlass";
import { UploadSimpleIcon } from "@phosphor-icons/react/UploadSimple";
import { getRouteApi, useRouter } from "@tanstack/react-router";
import { useState } from "react";

import { BackupList } from "@/app/client/components/BackupList";
import { useAsyncAction } from "@/app/client/hooks/useAsyncAction";
import { useDateFormats } from "@/app/client/hooks/useDateFormats";
import { useModalItem } from "@/app/client/hooks/useModalItem";
import { ContentLayout } from "@/app/client/layouts/ContentLayout";
import {
  cleanUpBackups,
  removeBackup,
  restoreFromBackup,
  restoreFromUpload,
  runJobNow,
} from "@/app/rpc";
import { formatDateTime } from "@/app/shared/utils/dates";

const route = getRouteApi("/system/backups");

export const SystemBackups = () => {
  const formats = useDateFormats();
  const { backups } = route.useLoaderData();
  const { job } = backups;
  const router = useRouter();
  const create = useAsyncAction({ toast: true });
  const cleanup = useAsyncAction({ toast: true });
  const restore = useAsyncAction({ toast: true });
  const [query, setQuery] = useState("");
  const upload = useModalItem<File>();

  const files = backups.files.filter((file) =>
    file.name.toLowerCase().includes(query.trim().toLowerCase()),
  );

  const restoreUpload = (file: File) => {
    const body = new FormData();
    body.set("archive", file);
    void restore.run(async () => {
      await restoreFromUpload({ data: body });
      await router.invalidate();
    }, "Could not restore that archive.");
  };

  return (
    <ContentLayout title="Backups">
      <Stack>
        <Group gap="xs" wrap="wrap">
          <TextInput
            flex="1 1 12rem"
            aria-label="Search backups"
            placeholder="Search backups..."
            leftSection={<MagnifyingGlassIcon />}
            value={query}
            onChange={(event) => setQuery(event.currentTarget.value)}
          />
          <FileButton
            accept="application/zip,.zip"
            onChange={(file) => {
              if (file !== null) {
                upload.open(file);
              }
            }}>
            {(props) => (
              <Tooltip label="Restore from a file">
                <ActionIcon
                  {...props}
                  variant="default"
                  size="lg"
                  aria-label="Restore from a file"
                  loading={restore.pending}>
                  <UploadSimpleIcon />
                </ActionIcon>
              </Tooltip>
            )}
          </FileButton>
          <Tooltip label="Back up now">
            <ActionIcon
              variant="default"
              size="lg"
              aria-label="Back up now"
              loading={create.pending || job.running !== null}
              onClick={() =>
                void create.run(async () => {
                  await runJobNow({ data: { name: job.name } });
                  await router.invalidate();
                }, "Could not take a backup.")
              }>
              <FileArchiveIcon />
            </ActionIcon>
          </Tooltip>
          <Tooltip label="Delete backups past retention">
            <ActionIcon
              variant="default"
              size="lg"
              aria-label="Delete backups past retention"
              loading={cleanup.pending}
              onClick={() =>
                void cleanup.run(async () => {
                  await cleanUpBackups();
                  await router.invalidate();
                }, "Could not clean up the backups.")
              }>
              <BroomIcon />
            </ActionIcon>
          </Tooltip>
        </Group>

        <Text size="sm" c="dimmed">
          Last backup:{" "}
          {job.last === null
            ? "never"
            : `${formatDateTime(formats, job.last.startedAt)} — ${job.last.status}`}
        </Text>

        {job.last?.error != null && (
          <Alert color="red" title="The last backup failed">
            {job.last.error}
          </Alert>
        )}

        <BackupList
          files={files}
          filtered={files.length < backups.files.length}
          pending={restore.pending}
          onDelete={async (name) => {
            await removeBackup({ data: { name } });
          }}
          onRestore={(name) =>
            void restore.run(async () => {
              await restoreFromBackup({ data: { name } });
              await router.invalidate();
            }, "Could not restore that backup.")
          }
        />
      </Stack>

      <Modal {...upload.props} title="Restore from a file" centered>
        <Stack>
          <Text size="sm">
            Every setting, instance, and catalog row is replaced with the
            contents of this archive. Only an archive taken by this version is
            accepted, and the current database is kept until the restored one
            answers a query.
          </Text>
          <Text size="xs" ff="monospace" c="dimmed">
            {upload.item?.name}
          </Text>
          <Group justify="flex-end">
            <Button variant="default" onClick={upload.close}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (upload.item !== null) {
                  restoreUpload(upload.item);
                }
                upload.close();
              }}>
              Restore
            </Button>
          </Group>
        </Stack>
      </Modal>
    </ContentLayout>
  );
};
