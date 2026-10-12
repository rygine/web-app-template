import { Text } from "@mantine/core";

import { ContentLayout } from "@/app/client/layouts/ContentLayout";

// No button: the navbar is on screen and is the way out.
export const NotFoundPage = () => (
  <ContentLayout title="Not found">
    <Text c="dimmed">That page does not exist.</Text>
  </ContentLayout>
);
