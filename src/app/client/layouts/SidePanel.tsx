import { Box, Group, Stack, Text } from "@mantine/core";
import type { ReactNode } from "react";

import classes from "./SidePanel.module.css";

type SidePanelProps = {
  title: string;
  close: ReactNode;
  children: ReactNode;
};

export const SidePanel = ({ title, close, children }: SidePanelProps) => (
  <Stack component="aside" className={classes.panel} gap={0}>
    <Group
      className={classes.header}
      flex="0 0 auto"
      px="md"
      gap="sm"
      wrap="nowrap">
      <Text className={classes.title} fw={600} size="sm" flex={1} truncate>
        {title}
      </Text>
      {close}
    </Group>
    <Box className={classes.body} flex={1} p="md">
      {children}
    </Box>
  </Stack>
);
