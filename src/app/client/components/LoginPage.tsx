import { Button, PasswordInput, Text, TextInput } from "@mantine/core";
import { getRouteApi, useRouter } from "@tanstack/react-router";

import { AuthCard } from "@/app/client/components/AuthCard";
import { useAsyncAction } from "@/app/client/hooks/useAsyncAction";
import { fieldText } from "@/app/client/utils/form";
import { login } from "@/app/rpc";
import { safeRedirect } from "@/app/shared/utils/redirect";

const route = getRouteApi("/login");

export const LoginPage = () => {
  const { redirect } = route.useSearch();
  const router = useRouter();
  const { pending, error, run } = useAsyncAction();

  return (
    <AuthCard
      title="Log in"
      onSubmit={(form) =>
        void run(async () => {
          await login({
            data: {
              username: fieldText(form, "username"),
              password: fieldText(form, "password"),
            },
          });
          await router.invalidate();
          router.history.push(safeRedirect(redirect));
        }, "Could not log in.")
      }>
      <TextInput
        name="username"
        label="Username"
        autoComplete="username"
        required
      />
      <PasswordInput
        name="password"
        label="Password"
        autoComplete="current-password"
        required
      />
      {error !== null && (
        <Text c="red" size="sm" role="alert">
          {error}
        </Text>
      )}
      <Button type="submit" loading={pending}>
        Log in
      </Button>
    </AuthCard>
  );
};
