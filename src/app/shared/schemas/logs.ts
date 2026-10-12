import { z } from "zod";

import { pageSchema, pageSizeSchema } from "@/app/shared/schemas/paging";

export const LOG_PAGE_SIZES = [50, 100, 200] as const;

export const LOG_LEVEL_FILTERS = [
  "all",
  "trace",
  "debug",
  "info",
  "warn",
  "error",
] as const;

const logLevelFilterSchema = z.enum(LOG_LEVEL_FILTERS, {
  error: "Level must be all, trace, debug, info, warn, or error.",
});

export const logSearchSchema = z.object({
  page: pageSchema,
  size: pageSizeSchema(LOG_PAGE_SIZES, 100),
  level: logLevelFilterSchema.default("all"),
  sources: z
    .array(z.string({ error: "A source must be text." }))
    .max(50, "Choose 50 sources or fewer.")
    .default([]),
  search: z
    .string({ error: "Search must be text." })
    .trim()
    .max(200, "Search must be 200 characters or fewer.")
    .optional(),
});

export type LogView = {
  time: Date;
  level: string;
  namespace: string;
  message: string;
  fields: Record<string, string>;
  errors: string[];
  requestId: string | null;
};

export type LogPage = {
  entries: LogView[];
  total: number;
  pageCount: number;
  sources: string[];
};
