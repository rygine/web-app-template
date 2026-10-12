import { Box, FocusTrap, Group, Stack } from "@mantine/core";
import { useWindowEvent } from "@mantine/hooks";
import { useState } from "react";
import type { ReactNode } from "react";

import { AppBrand } from "@/app/client/components/AppBrand";
import { LayoutContext } from "@/app/client/contexts/layout";
import { writeLayoutWidth } from "@/app/client/utils/layout";
import type { LayoutWidth } from "@/app/shared/utils/width";

import classes from "./MainLayout.module.css";

type MainLayoutProps = {
  nav: ReactNode;
  initialWidth: LayoutWidth;
  instanceName: string;
  children: ReactNode;
};

export const MainLayout = ({
  nav,
  initialWidth,
  instanceName,
  children,
}: MainLayoutProps) => {
  const [navOpen, setNavOpen] = useState(false);
  const [width, setWidthState] = useState(initialWidth);

  const openNav = () => setNavOpen(true);
  const closeNav = () => setNavOpen(false);

  const setWidth = (next: LayoutWidth) => {
    setWidthState(next);
    writeLayoutWidth(next);
  };

  useWindowEvent("keydown", (event) => {
    if (navOpen && event.key === "Escape") {
      closeNav();
    }
  });

  return (
    <LayoutContext.Provider
      value={{ navOpen, openNav, closeNav, width, setWidth }}>
      <div
        className={classes.root}
        data-layout-width={width}
        data-nav-open={navOpen}>
        {navOpen && (
          <Box className={classes.scrim} hiddenFrom="sm" onClick={closeNav} />
        )}
        <FocusTrap active={navOpen}>
          <Stack
            component="nav"
            className={classes.nav}
            gap={0}
            aria-label="Main">
            <Group
              className={classes.navHeader}
              flex="0 0 auto"
              px="md"
              gap={0}
              wrap="nowrap">
              <AppBrand name={instanceName} />
            </Group>
            <Box className={classes.navBody} flex={1} p="xs">
              {nav}
            </Box>
          </Stack>
        </FocusTrap>
        <Stack component="main" className={classes.main} gap={0} flex={1}>
          {children}
        </Stack>
      </div>
    </LayoutContext.Provider>
  );
};
