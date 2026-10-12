import { z } from "zod";

// Zod iterates it to build the enum.
export const AUTH_MODES = ["forms", "forms-except-local"] as const;

export const authModeSchema = z.enum(AUTH_MODES, {
  error: "Login must be forms or forms-except-local.",
});

export type AuthMode = z.infer<typeof authModeSchema>;

const username = z
  .string({ error: "Username is required." })
  .trim()
  .min(1, "Username is required.")
  .max(60, "Username must be 60 characters or fewer.");

export const credentialsSchema = z.object({
  username,
  password: z
    .string({ error: "Password is required." })
    .min(8, "Password must be 8 characters or more.")
    .max(200, "Password must be 200 characters or fewer."),
});

export const loginSchema = z.object({
  username,
  password: z
    .string({ error: "Password is required." })
    .min(1, "Password is required.")
    .max(200, "Password must be 200 characters or fewer."),
});

export const loginSearchSchema = z.object({
  redirect: z.string().optional(),
});
