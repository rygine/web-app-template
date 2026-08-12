import { Outlet, createFileRoute } from "@tanstack/react-router";

import { list } from "@/features/items/rpc";
import { itemSearchSchema } from "@/features/items/shared/schemas/items";

export const Route = createFileRoute("/items")({
  ssr: "data-only",
  validateSearch: itemSearchSchema.catch(() => itemSearchSchema.parse({})),
  loaderDeps: ({ search }) => search,
  loader: ({ deps }) => list({ data: deps }),
  component: Outlet,
});
