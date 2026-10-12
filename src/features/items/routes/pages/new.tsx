import { createFileRoute, redirect } from "@tanstack/react-router";

import { ItemList } from "@/features/items/client/components/ItemList";

export const Route = createFileRoute("/items/new")({
  // A new item is always incomplete, so the complete filter would hide the one
  // being created. Owned by the route, so every way in lands the same place.
  beforeLoad: ({ search }) => {
    if (search.status === "complete") {
      throw redirect({
        to: "/items/new",
        search: { ...search, status: "incomplete", page: 1 },
        replace: true,
      });
    }
  },
  // A one-line adapter over ItemList, inlined rather than given a file of
  // its own.
  component: () => <ItemList creating />,
});
