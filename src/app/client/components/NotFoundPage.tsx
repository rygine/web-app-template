import { Text } from "@mantine/core";

import { ContentLayout } from "@/app/client/layouts/ContentLayout";

// No button, for the reason ErrorPage has none: it used to offer "Back to
// items", which stopped meaning anything once items was one section among
// several. The navbar is on screen and is the way out.
export const NotFoundPage = () => (
  <ContentLayout title="Not found">
    <Text c="dimmed">That page does not exist.</Text>
  </ContentLayout>
);
