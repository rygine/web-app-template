import { createRouter } from "@tanstack/react-router";

import { ErrorPage } from "@/app/client/components/ErrorPage";
import { NotFoundPage } from "@/app/client/components/NotFoundPage";
import { routeTree } from "@/routeTree.gen";

export const getRouter = () =>
  createRouter({
    routeTree,
    // The document is the scroll container, which scroll restoration handles natively.
    scrollRestoration: true,
    defaultPreload: "intent",
    defaultPreloadStaleTime: 0,
    // An awaited invalidate() resolves after the fresh loader data lands.
    defaultStaleReloadMode: "blocking",
    defaultErrorComponent: ErrorPage,
    defaultNotFoundComponent: NotFoundPage,
  });
