import { Button, Stack, Text } from "@mantine/core";
import { useRouter } from "@tanstack/react-router";
import type { ErrorComponentProps } from "@tanstack/react-router";

import { ContentLayout } from "@/app/client/layouts/ContentLayout";
import { failureMessage } from "@/app/shared/utils/errors";

// Retry is `router.invalidate()`, not the `reset` this component is handed.
// `reset` clears the error boundary and nothing else, so the loader that failed
// keeps its error and the page comes straight back — the button looks dead.
// Invalidating re-runs the loaders and resets the boundary as a consequence.
export const ErrorPage = ({ error }: ErrorComponentProps) => {
  const router = useRouter();

  return (
    <ContentLayout title="Something went wrong">
      <Stack align="flex-start">
        <Text>{failureMessage("Could not load this page.", error)}</Text>
        <Button onClick={() => void router.invalidate()}>Try again</Button>
      </Stack>
    </ContentLayout>
  );
};
