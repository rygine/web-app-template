import { Paper, Stack, Title } from "@mantine/core";
import type { FormEvent, ReactNode } from "react";

import classes from "./AuthCard.module.css";

export const AuthCard = ({
  title,
  onSubmit,
  children,
}: {
  title: string;
  onSubmit: (form: FormData) => void;
  children: ReactNode;
}) => (
  <Paper withBorder p="xl" radius="md" className={classes.card}>
    <form
      onSubmit={(event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        onSubmit(new FormData(event.currentTarget));
      }}>
      <Stack>
        <Title order={1} size="h3">
          {title}
        </Title>
        {children}
      </Stack>
    </form>
  </Paper>
);
