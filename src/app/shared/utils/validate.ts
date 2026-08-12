import type { z } from "zod";

// A function validator rather than the schema itself: Start hands a Standard
// Schema failure to the caller as `new Error(JSON.stringify(issues))`, where a
// function validator throws the ZodError the boundary already maps.
export const validate =
  <TSchema extends z.ZodType>(schema: TSchema) =>
  (value: z.input<TSchema>): z.output<TSchema> =>
    schema.parse(value);
