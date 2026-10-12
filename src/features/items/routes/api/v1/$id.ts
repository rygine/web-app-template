import { createFileRoute } from "@tanstack/react-router";

import {
  methodNotAllowed,
  readJson,
  withApiRoute,
} from "@/app/server/utils/http";
import {
  deleteItem,
  getItem,
  updateItem,
} from "@/features/items/server/services/items";
import { toItemResponse } from "@/features/items/shared/schemas/items";

export const Route = createFileRoute("/api/v1/items/$id")({
  server: {
    handlers: {
      GET: ({ params, request }) =>
        withApiRoute(request, async () =>
          Response.json(toItemResponse(await getItem(params.id))),
        ),
      PUT: ({ params, request }) =>
        withApiRoute(request, async () =>
          Response.json(
            toItemResponse(
              await updateItem(params.id, await readJson(request)),
            ),
          ),
        ),
      DELETE: ({ params, request }) =>
        withApiRoute(request, async () => {
          await deleteItem(params.id);
          return new Response(null, { status: 204 });
        }),
      ANY: () => methodNotAllowed("GET", "PUT", "DELETE"),
    },
  },
});
