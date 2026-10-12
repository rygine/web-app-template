import { Button, PasswordInput, Text, TextInput } from "@mantine/core";
import { useRouter } from "@tanstack/react-router";

import { AuthCard } from "@/app/client/components/AuthCard";
import { useAsyncAction } from "@/app/client/hooks/useAsyncAction";
import { fieldText } from "@/app/client/utils/form";
import { setup } from "@/app/rpc";
import { ReportableError } from "@/app/shared/utils/errors";

export const SetupPage = () => {
  const router = useRouter();
  const { pending, error, run } = useAsyncAction();

  return (
    <AuthCard
      title="Create the account"
      onSubmit={(form) =>
        void run(async () => {
          const password = fieldText(form, "password");
          if (password !== fieldText(form, "confirm")) {
            throw new ReportableError("The passwords do not match.");
          }
          await setup({
            data: { username: fieldText(form, "username"), password },
          });
          await router.invalidate();
          router.history.push("/");
        }, "Could not create the account.")
      }>
      <Text size="sm" c="dimmed">
        This is the only account. If you lose the password, restart with
        RESET_AUTH=1.
      </Text>
      <TextInput
        name="username"
        label="Username"
        autoComplete="username"
        required
      />
      <PasswordInput
        name="password"
        label="Password"
        autoComplete="new-password"
        required
      />
      <PasswordInput
        name="confirm"
        label="Confirm password"
        autoComplete="new-password"
        required
      />
      {error !== null && (
        <Text c="red" size="sm" role="alert">
          {error}
        </Text>
      )}
      <Button type="submit" loading={pending}>
        Create account
      </Button>
    </AuthCard>
  );
};
