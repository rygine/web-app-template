import { Outlet, getRouteApi } from "@tanstack/react-router";

import { AppNav } from "@/app/client/components/AppNav";
import { MainLayout } from "@/app/client/layouts/MainLayout";

const route = getRouteApi("__root__");

export const RootLayout = () => {
  const { width, instanceName } = route.useLoaderData();

  return (
    <MainLayout
      nav={<AppNav />}
      initialWidth={width}
      instanceName={instanceName}>
      <Outlet />
    </MainLayout>
  );
};
