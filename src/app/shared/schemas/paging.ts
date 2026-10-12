import { z } from "zod";

export const pageSchema = z.coerce
  .number({ error: "Page must be a number." })
  .int("Page must be a whole number.")
  .positive("Page must be 1 or greater.")
  .default(1);

// Bounded to a literal set, because the same schema answers a REST query: an
// unbounded size is a way to pull the whole table in one request from a URL.
export const pageSizeSchema = <const T extends readonly number[]>(
  sizes: T,
  fallback: T[number],
) =>
  z.coerce
    .number({ error: "Page size must be a number." })
    .int("Page size must be a whole number.")
    .pipe(
      z.literal(sizes, {
        error: `Page size must be one of ${sizes.join(", ")}.`,
      }),
    )
    .default(fallback);
