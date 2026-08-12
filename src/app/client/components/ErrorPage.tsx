import { Button, Code, Stack } from "@mantine/core";
import { useRouter } from "@tanstack/react-router";
import type { ErrorComponentProps } from "@tanstack/react-router";

import { ContentLayout } from "@/app/client/layouts/ContentLayout";

// Retry is `router.invalidate()`, not the `reset` this component is handed.
// `reset` clears the error boundary and nothing else, so the loader that failed
// keeps its error and the page comes straight back — the button looks dead.
// Invalidating re-runs the loaders and resets the boundary as a consequence.
//
// There used to be a "Back to items" button beside it, from when items was the
// only destination; with a navbar full of sections it named one arbitrarily.
export const ErrorPage = ({ error }: ErrorComponentProps) => {
  const router = useRouter();

  return (
    <ContentLayout title="Something went wrong">
      <Stack align="flex-start">
        <Code block>
          {error instanceof Error ? error.message : String(error)}
        </Code>
        <Button onClick={() => void router.invalidate()}>Try again</Button>
      </Stack>
    </ContentLayout>
  );
};
