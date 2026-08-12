import {
  Alert,
  Button,
  Divider,
  FileButton,
  Group,
  NumberInput,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import { getRouteApi, useRouter } from "@tanstack/react-router";
import { useState } from "react";

import { BackupList } from "@/app/client/components/BackupList";
import { UnsavedChangesModal } from "@/app/client/components/UnsavedChangesModal";
import { useAsyncAction } from "@/app/client/hooks/useAsyncAction";
import { useDateFormats } from "@/app/client/hooks/useDateFormats";
import { useSettingsForm } from "@/app/client/hooks/useSettingsForm";
import { ContentLayout } from "@/app/client/layouts/ContentLayout";
import { removeBackup, restoreFromUpload, runJobNow } from "@/app/rpc";
import {
  BACKUP_FOLDER_MAX,
  BACKUP_INTERVAL_DAYS,
  BACKUP_RETENTION_DAYS,
} from "@/app/shared/schemas/settings";
import { formatDateTime } from "@/app/shared/utils/dates";

const route = getRouteApi("/system/backups");

export const SystemBackups = () => {
  const formats = useDateFormats();
  const { settings, backups } = route.useLoaderData();
  const { job } = backups;
  const { commit, blocker } = useSettingsForm();
  const router = useRouter();
  const run = useAsyncAction({ toast: true });
  const restore = useAsyncAction({ toast: true });
  const remove = useAsyncAction({ toast: true });
  const [folder, setFolder] = useState(settings.backupFolder);
  const [intervalDays, setIntervalDays] = useState<number | string>(
    settings.backupInterval,
  );
  const [retentionDays, setRetentionDays] = useState<number | string>(
    settings.backupRetention,
  );

  const handleBackupNow = () =>
    run.run(async () => {
      await runJobNow({ data: { name: job.name } });
      await router.invalidate();
    }, "Could not take a backup.");

  const handleDelete = (name: string) =>
    void remove.run(async () => {
      await removeBackup({ data: { name } });
      await router.invalidate();
    }, "Could not delete that backup.");

  const handleRestore = (file: File | null) => {
    if (file === null) {
      return;
    }
    const body = new FormData();
    body.set("archive", file);
    void restore.run(async () => {
      await restoreFromUpload({ data: body });
      await router.invalidate();
    }, "Could not restore that archive.");
  };

  return (
    <ContentLayout
      title="System"
      actions={
        <FileButton accept="application/zip,.zip" onChange={handleRestore}>
          {(props) => (
            <Button size="xs" loading={restore.pending} {...props}>
              Restore
            </Button>
          )}
        </FileButton>
      }>
      <Stack>
        <Title order={2} size="h4">
          Backups
        </Title>
        <Text size="sm" c="dimmed">
          Archives are taken on the schedule below and kept for the retention
          period. Restoring applies in place with no restart and accepts only an
          archive taken by this version; the current database is kept until the
          restored one has answered a query.
        </Text>

        <TextInput
          label="Folder"
          description="A relative path is resolved inside the data directory."
          maxLength={BACKUP_FOLDER_MAX}
          value={folder}
          onChange={(event) => {
            const next = event.currentTarget.value;
            setFolder(next);
            commit({ backupFolder: next });
          }}
        />

        {/* Two narrow fields side by side rather than stacked, which left most
            of the row empty. They stack again below the breakpoint. */}
        <SimpleGrid cols={{ base: 1, sm: 2 }}>
          <NumberInput
            label="Interval"
            description="Days between automatic backups."
            min={BACKUP_INTERVAL_DAYS.min}
            max={BACKUP_INTERVAL_DAYS.max}
            allowDecimal={false}
            value={intervalDays}
            onChange={(value) => {
              setIntervalDays(value);
              // A half-typed field is a string; only a number is worth storing.
              if (typeof value === "number") {
                commit({ backupInterval: value });
              }
            }}
          />

          <NumberInput
            label="Retention"
            description="Days a backup is kept before it is deleted."
            min={BACKUP_RETENTION_DAYS.min}
            max={BACKUP_RETENTION_DAYS.max}
            allowDecimal={false}
            value={retentionDays}
            onChange={(value) => {
              setRetentionDays(value);
              if (typeof value === "number") {
                commit({ backupRetention: value });
              }
            }}
          />
        </SimpleGrid>

        <Divider />

        <Group justify="space-between" align="flex-end">
          <Stack gap={2}>
            <Text size="sm" fw={500}>
              Last run
            </Text>
            <Text size="sm" c="dimmed">
              {job.last === null
                ? "Never"
                : `${formatDateTime(formats, job.last.startedAt)} — ${job.last.status}`}
            </Text>
          </Stack>
          <Button
            variant="default"
            loading={run.pending || job.running !== null}
            onClick={() => void handleBackupNow()}>
            Back up now
          </Button>
        </Group>

        {job.last?.error != null && (
          <Alert color="red" title="The last backup failed">
            {job.last.error}
          </Alert>
        )}

        <BackupList
          files={backups.files}
          onDelete={handleDelete}
          pending={remove.pending}
        />

        <UnsavedChangesModal blocker={blocker} />
      </Stack>
    </ContentLayout>
  );
};
