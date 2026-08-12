import {
  ColorSchemeScript,
  MantineProvider,
  mantineHtmlProps,
} from "@mantine/core";
import { Notifications } from "@mantine/notifications";
import { HeadContent, Scripts } from "@tanstack/react-router";
import type { ReactNode } from "react";

export const RootShell = ({ children }: { children: ReactNode }) => (
  <html lang="en" {...mantineHtmlProps}>
    <head>
      <ColorSchemeScript defaultColorScheme="auto" />
      <HeadContent />
    </head>
    <body>
      <MantineProvider defaultColorScheme="auto">
        <Notifications />
        {children}
      </MantineProvider>
      <Scripts />
    </body>
  </html>
);
