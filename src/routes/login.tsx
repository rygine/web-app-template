import { createFileRoute } from "@tanstack/react-router";

import { LoginPage } from "@/app/client/components/LoginPage";
import { loginSearchSchema } from "@/app/shared/schemas/auth";

export const Route = createFileRoute("/login")({
  validateSearch: loginSearchSchema.catch({}),
  component: LoginPage,
});
