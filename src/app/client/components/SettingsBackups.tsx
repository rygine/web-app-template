import { NumberInput, SimpleGrid, Stack, TextInput } from "@mantine/core";
import { useState } from "react";

import {
  BACKUP_FOLDER_MAX,
  BACKUP_INTERVAL_DAYS,
  BACKUP_RETENTION_DAYS,
} from "@/app/shared/schemas/settings";
import type { Settings } from "@/app/shared/schemas/settings";

export const SettingsBackups = ({
  settings,
  commit,
}: {
  settings: Settings;
  commit: (patch: Partial<Settings>) => void;
}) => {
  const [folder, setFolder] = useState(settings.backupFolder);
  const [intervalDays, setIntervalDays] = useState<number | string>(
    settings.backupInterval,
  );
  const [retentionDays, setRetentionDays] = useState<number | string>(
    settings.backupRetention,
  );

  return (
    <Stack>
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
    </Stack>
  );
};
