import { createFileRoute } from "@tanstack/react-router";

import { ItemList } from "@/features/items/client/components/ItemList";

export const Route = createFileRoute("/items/")({
  component: ItemList,
});
