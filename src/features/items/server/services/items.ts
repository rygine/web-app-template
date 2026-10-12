import { createLogger } from "@/app/server/log/logger";
import { prisma } from "@/app/server/utils/prisma";
import { NotFoundError } from "@/app/shared/utils/errors";
import type {
  Item,
  ItemListResult,
  ItemStatus,
} from "@/features/items/shared/schemas/items";
import {
  createItemSchema,
  itemIdSchema,
  itemSearchSchema,
  updateItemSchema,
} from "@/features/items/shared/schemas/items";

const log = createLogger("items");

const isMissingRow = (error: unknown) =>
  typeof error === "object" &&
  error !== null &&
  "code" in error &&
  error.code === "P2025";

const whereForStatus = (status: ItemStatus) =>
  status === "all" ? {} : { completed: status === "complete" };

export const listItems = async (query: unknown): Promise<ItemListResult> => {
  const { page, status, size } = itemSearchSchema.parse(query);
  const where = whereForStatus(status);
  const [items, total] = await Promise.all([
    prisma.item.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * size,
      take: size,
    }),
    prisma.item.count({ where }),
  ]);
  log.debug("listItems: listing", {
    page,
    status,
    size,
    returned: items.length,
    total,
  });
  return {
    items,
    total,
    pageCount: Math.ceil(total / size),
  };
};

export const getItem = async (id: unknown): Promise<Item> => {
  const itemId = itemIdSchema.parse(id);
  const row = await prisma.item.findUnique({ where: { id: itemId } });
  if (!row) {
    log.debug("getItem: item not found", { id: itemId });
    throw new NotFoundError();
  }
  log.trace("getItem: item read", { id: itemId });
  return row;
};

export const createItem = async (input: unknown): Promise<Item> => {
  const { name, completed } = createItemSchema.parse(input);
  const item = await prisma.item.create({
    data: { name, completed, completedAt: completed ? new Date() : null },
  });
  log.info("createItem: item created", { id: item.id, completed });
  return item;
};

export const updateItem = async (
  id: unknown,
  input: unknown,
): Promise<Item> => {
  const itemId = itemIdSchema.parse(id);
  const data = updateItemSchema.parse(input);
  log.trace("updateItem: applying", {
    id: itemId,
    fields: Object.keys(data).join(","),
  });
  try {
    const item = await prisma.item.update({
      where: { id: itemId },
      data: {
        ...data,
        ...(data.completed === undefined
          ? {}
          : { completedAt: data.completed ? new Date() : null }),
      },
    });
    log.info("updateItem: item updated", {
      id: item.id,
      completed: item.completed,
    });
    return item;
  } catch (error) {
    if (isMissingRow(error)) {
      log.debug("updateItem: item not found", { id: itemId });
      throw new NotFoundError();
    }
    throw error;
  }
};

export const deleteItem = async (id: unknown): Promise<void> => {
  const itemId = itemIdSchema.parse(id);
  try {
    await prisma.item.delete({ where: { id: itemId } });
    log.info("deleteItem: item deleted", { id: itemId });
  } catch (error) {
    if (isMissingRow(error)) {
      log.debug("deleteItem: item not found", { id: itemId });
      throw new NotFoundError();
    }
    throw error;
  }
};
