import { createFileRoute } from "@tanstack/react-router";

import {
  methodNotAllowed,
  readJson,
  withApiRoute,
} from "@/app/server/utils/http";
import { createItem, listItems } from "@/features/items/server/services/items";
import {
  toItemListResponse,
  toItemResponse,
} from "@/features/items/shared/schemas/items";

export const Route = createFileRoute("/api/v1/items/")({
  server: {
    handlers: {
      GET: ({ request }) =>
        withApiRoute(request, async () => {
          const query = Object.fromEntries(new URL(request.url).searchParams);
          return Response.json(toItemListResponse(await listItems(query)));
        }),
      POST: ({ request }) =>
        withApiRoute(request, async () =>
          Response.json(
            toItemResponse(await createItem(await readJson(request))),
            {
              status: 201,
            },
          ),
        ),
      ANY: () => methodNotAllowed("GET", "POST"),
    },
  },
});
