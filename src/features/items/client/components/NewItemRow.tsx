import { ActionIcon, Group, Table, TextInput } from "@mantine/core";
import { CheckIcon } from "@phosphor-icons/react/Check";
import { XIcon } from "@phosphor-icons/react/X";
import { getRouteApi, useRouter } from "@tanstack/react-router";
import { useState } from "react";

import { useAsyncAction } from "@/app/client/hooks/useAsyncAction";
import { create } from "@/features/items/rpc";

import classes from "./ItemList.module.css";

const route = getRouteApi("/items");

export const NewItemRow = () => {
  const router = useRouter();
  const navigate = route.useNavigate();
  const search = route.useSearch();
  const [name, setName] = useState("");
  const { pending, run } = useAsyncAction({ toast: true });

  const close = () => navigate({ to: "/items", search });

  const handleCreate = () =>
    run(async () => {
      await create({ data: { name } });
      await navigate({ to: "/items", search });
      await router.invalidate();
    }, "Could not create the item.");

  return (
    <Table.Tr>
      <Table.Td />
      <Table.Td className={classes.nameColumn}>
        <TextInput
          aria-label="Name"
          autoFocus
          value={name}
          disabled={pending}
          onChange={(event) => setName(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              // Two steps: what is typed here is its only copy, where the
              // rename row's Escape leaves the original name on screen.
              if (name.length > 0) {
                setName("");
              } else {
                void close();
              }
            }
            if (event.key === "Enter" && name.trim().length > 0) {
              void handleCreate();
            }
          }}
        />
      </Table.Td>
      <Table.Td />
      <Table.Td>
        <Group gap="xs" justify="flex-end" wrap="nowrap">
          <ActionIcon
            variant="subtle"
            loading={pending}
            disabled={name.trim().length === 0}
            aria-label="Create item"
            onClick={() => void handleCreate()}>
            <CheckIcon />
          </ActionIcon>
          <ActionIcon
            variant="subtle"
            color="gray"
            aria-label="Cancel creating"
            onClick={() => void close()}>
            <XIcon />
          </ActionIcon>
        </Group>
      </Table.Td>
    </Table.Tr>
  );
};
