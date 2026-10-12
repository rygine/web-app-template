import { Code, Stack, TextInput, Title } from "@mantine/core";
import { useState } from "react";

import { SettingValue } from "@/app/client/components/SettingValue";
import type { RuntimeView } from "@/app/shared/schemas/runtime";
import { INSTANCE_NAME_MAX } from "@/app/shared/schemas/settings";
import type { Settings } from "@/app/shared/schemas/settings";
import { APP_NAME } from "@/app/shared/utils/app";

export const SettingsHost = ({
  settings,
  runtime,
  commit,
}: {
  settings: Settings;
  runtime: RuntimeView;
  commit: (patch: Partial<Settings>) => void;
}) => {
  const [instanceName, setInstanceName] = useState(settings.instanceName ?? "");

  return (
    <Stack>
      <Title order={2} size="h4">
        Host
      </Title>

      <TextInput
        label="Instance name"
        description="Shown in the navigation bar and the browser tab."
        placeholder={APP_NAME}
        maxLength={INSTANCE_NAME_MAX}
        value={instanceName}
        onChange={(event) => {
          const next = event.currentTarget.value;
          setInstanceName(next);
          commit({ instanceName: next });
        }}
      />

      <SettingValue
        label="Port"
        value={runtime.port}
        description={
          <>
            Set <Code>PORT</Code> before starting. Under Docker the published
            mapping is fixed when the container is created, so changing it means
            recreating the container.
          </>
        }
      />

      <SettingValue
        label="Bind address"
        value={runtime.host}
        description={
          <>
            Set <Code>HOST</Code> before starting. Under Docker the container
            binds <Code>0.0.0.0</Code> and <Code>BIND_ADDR</Code> chooses which
            host interface the port is published on.
          </>
        }
      />

      <SettingValue
        label="Data directory"
        value={runtime.dataDir}
        description={
          <>
            Set <Code>DATA_DIR</Code> before starting. It holds the database
            this page is stored in.
          </>
        }
      />

      <SettingValue
        label="Logs directory"
        value={runtime.logsDir}
        description={
          <>
            Set <Code>LOGS_DIR</Code> before starting. It holds log archives;
            the log entries themselves live in the database.
          </>
        }
      />
    </Stack>
  );
};
