import { Box, Burger, Group, Title } from "@mantine/core";
import type { ReactNode } from "react";

import { ThemeToggle } from "@/app/client/components/ThemeToggle";
import { WidthMenu } from "@/app/client/components/WidthMenu";
import { useLayout } from "@/app/client/contexts/layout";

import classes from "./ContentLayout.module.css";

type ContentLayoutProps = {
  title: string;
  actions?: ReactNode;
  children: ReactNode;
};

export const ContentLayout = ({
  title,
  actions,
  children,
}: ContentLayoutProps) => {
  const { navOpen, openNav } = useLayout();

  return (
    <>
      <Group
        component="header"
        className={classes.header}
        flex="0 0 auto"
        px="md"
        gap="sm"
        wrap="nowrap">
        <Burger
          opened={navOpen}
          onClick={openNav}
          size="sm"
          aria-label="Open navigation"
          flex="0 0 auto"
          hiddenFrom="sm"
        />
        <Title order={1} size="h4" className={classes.title} lineClamp={1}>
          {title}
        </Title>
        <Group gap="xs" wrap="nowrap" flex="0 0 auto" ml="auto">
          {actions}
          <WidthMenu />
          <ThemeToggle />
        </Group>
      </Group>
      <Box flex={1} p="md">
        {children}
      </Box>
    </>
  );
};
