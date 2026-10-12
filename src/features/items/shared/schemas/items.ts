import { z } from "zod";

import { pageSchema, pageSizeSchema } from "@/app/shared/schemas/paging";

export const ITEM_PAGE_SIZES = [10, 25, 50, 100] as const;
export const ITEM_PAGE_SIZE_DEFAULT = 10;

const itemName = z
  .string({
    error: (issue) =>
      issue.input === undefined ? "Name is required." : "Name must be text.",
  })
  .min(1, "Name is required.")
  .max(100, "Name must be 100 characters or fewer.");

export const itemStatusSchema = z
  .enum(["all", "incomplete", "complete"], {
    error: "Status must be all, incomplete, or complete.",
  })
  .default("all");

export type ItemStatus = z.infer<typeof itemStatusSchema>;

export const itemSearchSchema = z.object({
  page: pageSchema,
  status: itemStatusSchema,
  size: pageSizeSchema(ITEM_PAGE_SIZES, ITEM_PAGE_SIZE_DEFAULT),
});

export const itemIdSchema = z
  .string({ error: "An item id is required." })
  .min(1, "An item id is required.");

const itemCompleted = z.boolean({
  error: "Completed must be true or false.",
});

export const createItemSchema = z.object({
  name: itemName,
  completed: itemCompleted.default(false),
});

const itemUpdateFields = z.object({
  name: itemName.optional(),
  completed: itemCompleted.optional(),
});

const hasUpdate = (value: { name?: string; completed?: boolean }) =>
  value.name !== undefined || value.completed !== undefined;

const noUpdate = { message: "Provide at least one field to update." };

export const updateItemSchema = itemUpdateFields.refine(hasUpdate, noUpdate);

export const updateItemInputSchema = itemUpdateFields
  .extend({ id: itemIdSchema })
  .refine(hasUpdate, noUpdate);

export type Item = {
  id: string;
  name: string;
  completed: boolean;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type ItemListResult = {
  items: Item[];
  total: number;
  pageCount: number;
};

export type ItemResponse = {
  id: string;
  name: string;
  completed: boolean;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ItemListResponse = {
  items: ItemResponse[];
  total: number;
  pageCount: number;
};

export const toItemResponse = ({
  id,
  name,
  completed,
  completedAt,
  createdAt,
  updatedAt,
}: Item): ItemResponse => ({
  id,
  name,
  completed,
  completedAt: completedAt?.toISOString() ?? null,
  createdAt: createdAt.toISOString(),
  updatedAt: updatedAt.toISOString(),
});

export const toItemListResponse = ({
  items,
  total,
  pageCount,
}: ItemListResult): ItemListResponse => ({
  items: items.map(toItemResponse),
  total,
  pageCount,
});
