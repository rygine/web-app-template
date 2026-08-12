import { Group, Text } from "@mantine/core";

import { APP_VERSION } from "@/app/shared/utils/app";

export const AppBrand = ({ name }: { name: string }) => (
  <Group gap="xs" wrap="nowrap">
    <img src="/favicon.svg" alt="" width={24} height={24} />
    <Text fw={700} size="sm" truncate>
      {name}
    </Text>
    <Text size="xs" c="dimmed">
      v{APP_VERSION}
    </Text>
  </Group>
);
