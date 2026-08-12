import { createRouter } from "@tanstack/react-router";

import { ErrorPage } from "@/app/client/components/ErrorPage";
import { NotFoundPage } from "@/app/client/components/NotFoundPage";
import { routeTree } from "@/routeTree.gen";

export const getRouter = () =>
  createRouter({
    routeTree,
    // The document is the scroll container, which is the case scroll
    // restoration handles natively — no scrollToTopSelectors needed.
    scrollRestoration: true,
    defaultPreload: "intent",
    defaultPreloadStaleTime: 0,
    defaultErrorComponent: ErrorPage,
    defaultNotFoundComponent: NotFoundPage,
  });
