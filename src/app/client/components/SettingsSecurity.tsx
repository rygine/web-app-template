import { Button, Code, CopyButton, Group, Stack, Text } from "@mantine/core";
import { getRouteApi, useRouter } from "@tanstack/react-router";
import { useState } from "react";

import { EnvManagedAlert } from "@/app/client/components/EnvManagedAlert";
import { SettingSelect } from "@/app/client/components/SettingSelect";
import { SettingValue } from "@/app/client/components/SettingValue";
import { useAsyncAction } from "@/app/client/hooks/useAsyncAction";
import { regenerateKey } from "@/app/rpc";
import { authModeSchema } from "@/app/shared/schemas/auth";
import type { AuthMode } from "@/app/shared/schemas/auth";
import type { Settings } from "@/app/shared/schemas/settings";

const route = getRouteApi("/settings");

const AUTH_OPTIONS: { value: AuthMode; label: string }[] = [
  { value: "forms", label: "Always" },
  { value: "forms-except-local", label: "Except from local addresses" },
];

export const SettingsSecurity = ({
  settings,
  commitNow,
}: {
  settings: Settings;
  commitNow: (patch: Partial<Settings>) => void;
}) => {
  const { apiKey } = route.useLoaderData();
  const { key, envManaged } = apiKey;
  const router = useRouter();
  const { pending, error, run } = useAsyncAction();
  // Held locally so the control answers the click before the reload.
  const [authMode, setAuthMode] = useState(settings.authMode);

  const handleRegenerate = () =>
    run(async () => {
      await regenerateKey();
      await router.invalidate();
    }, "Could not regenerate the key.");

  return (
    <Stack>
      <SettingSelect
        label="Require login"
        description="Local addresses are loopback and private networks, as the server sees them. Behind a reverse proxy or Docker port forwarding, every request can look local, so choose Always."
        data={AUTH_OPTIONS}
        value={authMode}
        schema={authModeSchema}
        maw={320}
        onChange={(mode) => {
          setAuthMode(mode);
          commitNow({ authMode: mode });
        }}
      />
      <Text size="sm" c="dimmed">
        Send the API key as an <Code>X-Api-Key</Code> header on any{" "}
        <Code>/api/</Code> request.
      </Text>

      <SettingValue label="API key" value={key} error={error} />

      <Group>
        <CopyButton value={key}>
          {({ copied, copy }) => (
            <Button variant="outline" onClick={copy}>
              {copied ? "Copied" : "Copy"}
            </Button>
          )}
        </CopyButton>
        {!envManaged && (
          <Button
            color="red"
            loading={pending}
            onClick={() => void handleRegenerate()}>
            Regenerate
          </Button>
        )}
      </Group>

      {envManaged && (
        <EnvManagedAlert variable="API_KEY">
          it overrides the stored key and cannot be regenerated here. Unset it
          to manage the key from this page.
        </EnvManagedAlert>
      )}
    </Stack>
  );
};
