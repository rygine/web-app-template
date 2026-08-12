import {
  Alert,
  Button,
  Code,
  CopyButton,
  Group,
  Stack,
  Text,
  Title,
} from "@mantine/core";
import { getRouteApi, useRouter } from "@tanstack/react-router";

import { EnvManagedAlert } from "@/app/client/components/EnvManagedAlert";
import { SettingValue } from "@/app/client/components/SettingValue";
import { useAsyncAction } from "@/app/client/hooks/useAsyncAction";
import { regenerateKey } from "@/app/rpc";

const route = getRouteApi("/settings");

export const SettingsSecurity = () => {
  const { apiKey } = route.useLoaderData();
  const { key, envManaged } = apiKey;
  const router = useRouter();
  const { pending, error, run } = useAsyncAction();

  const handleRegenerate = () =>
    run(async () => {
      await regenerateKey();
      await router.invalidate();
    }, "Could not regenerate the key.");

  return (
    <Stack>
      <Title order={2} size="h4">
        Security
      </Title>
      <Text size="sm" c="dimmed">
        Send the API key as an <Code>X-Api-Key</Code> header on any{" "}
        <Code>/api/v1</Code> request.
      </Text>

      <SettingValue label="API key" value={key} error={error} />

      <Group>
        <CopyButton value={key}>
          {({ copied, copy }) => (
            <Button variant="default" onClick={copy}>
              {copied ? "Copied" : "Copy"}
            </Button>
          )}
        </CopyButton>
        {!envManaged && (
          <Button
            color="red"
            variant="outline"
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

      <Alert color="yellow" title="This key identifies callers, not people">
        It keeps external integrations apart and lets you cut one off. It is not
        access control: anything that can reach this page can read the key from
        it. Keep the service on a trusted network.
      </Alert>
    </Stack>
  );
};
