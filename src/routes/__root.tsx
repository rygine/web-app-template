import { createRootRoute } from "@tanstack/react-router";

import { RootLayout } from "@/app/client/layouts/RootLayout";
import { RootShell } from "@/app/client/layouts/RootShell";
import { getShell } from "@/app/rpc";
import { APP_NAME } from "@/app/shared/utils/app";

import mantineCss from "@mantine/core/styles.css?url";
import notificationsCss from "@mantine/notifications/styles.css?url";

export const Route = createRootRoute({
  head: ({ loaderData }) => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: loaderData?.instanceName ?? APP_NAME },
    ],
    links: [
      { rel: "icon", type: "image/svg+xml", href: "/favicon.svg" },
      { rel: "stylesheet", href: mantineCss },
      { rel: "stylesheet", href: notificationsCss },
    ],
  }),
  loader: () => getShell(),
  shellComponent: RootShell,
  component: RootLayout,
});
