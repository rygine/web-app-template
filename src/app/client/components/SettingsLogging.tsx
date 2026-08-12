import { Stack, Title } from "@mantine/core";
import { useState } from "react";

import { EnvManagedAlert } from "@/app/client/components/EnvManagedAlert";
import { SettingSelect } from "@/app/client/components/SettingSelect";
import type { RuntimeView } from "@/app/shared/schemas/runtime";
import { LOG_LEVELS, logLevelSchema } from "@/app/shared/schemas/settings";
import type { Settings } from "@/app/shared/schemas/settings";

const OPTIONS = LOG_LEVELS.map((level) => ({ value: level, label: level }));

export const SettingsLogging = ({
  settings,
  runtime,
  commitNow,
}: {
  settings: Settings;
  runtime: RuntimeView;
  commitNow: (patch: Partial<Settings>) => void;
}) => {
  // Held locally so the control answers the click, rather than waiting for the
  // write and the loader that follows it.
  const [logLevel, setLogLevel] = useState(settings.logLevel);

  return (
    <Stack>
      <Title order={2} size="h4">
        Logging
      </Title>

      <SettingSelect
        label="Log level"
        description="Applies immediately. Lower levels record more and grow the log table faster."
        data={OPTIONS}
        value={logLevel}
        schema={logLevelSchema}
        disabled={runtime.logLevelEnvManaged}
        maw={220}
        onChange={(level) => {
          setLogLevel(level);
          commitNow({ logLevel: level });
        }}
      />

      {runtime.logLevelEnvManaged && (
        <EnvManagedAlert variable="LOG_LEVEL">
          it overrides the stored level. Unset it to manage the level from this
          page.
        </EnvManagedAlert>
      )}
    </Stack>
  );
};
