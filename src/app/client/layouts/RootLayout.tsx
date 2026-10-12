import { Center } from "@mantine/core";
import { Outlet, getRouteApi, useRouterState } from "@tanstack/react-router";

import { AppNav } from "@/app/client/components/AppNav";
import { MainLayout } from "@/app/client/layouts/MainLayout";

import classes from "./RootLayout.module.css";

const route = getRouteApi("__root__");

export const RootLayout = () => {
  const { width, instanceName } = route.useLoaderData();
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });

  // Pages a signed-out visitor reaches, so they get no navbar.
  if (pathname === "/login" || pathname === "/setup") {
    return (
      <Center className={classes.bare} p="md">
        <Outlet />
      </Center>
    );
  }

  return (
    <MainLayout
      nav={<AppNav />}
      initialWidth={width}
      instanceName={instanceName}>
      <Outlet />
    </MainLayout>
  );
};
