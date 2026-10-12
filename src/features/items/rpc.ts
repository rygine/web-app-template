import { createServerFn } from "@tanstack/react-start";

import { validate } from "@/app/shared/utils/validate";
import {
  createItem,
  deleteItem,
  getItem,
  listItems,
  updateItem,
} from "@/features/items/server/services/items";
import {
  createItemSchema,
  itemIdSchema,
  itemSearchSchema,
  updateItemInputSchema,
} from "@/features/items/shared/schemas/items";

export const list = createServerFn({ method: "GET" })
  .validator(validate(itemSearchSchema))
  .handler(({ data }) => listItems(data));

export const get = createServerFn({ method: "GET" })
  .validator(validate(itemIdSchema))
  .handler(({ data }) => getItem(data));

export const create = createServerFn({ method: "POST" })
  .validator(validate(createItemSchema))
  .handler(({ data }) => createItem(data));

export const update = createServerFn({ method: "POST" })
  .validator(validate(updateItemInputSchema))
  .handler(({ data: { id, ...input } }) => updateItem(id, input));

export const remove = createServerFn({ method: "POST" })
  .validator(validate(itemIdSchema))
  .handler(({ data }) => deleteItem(data));
