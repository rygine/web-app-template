import {
  ActionIcon,
  Checkbox,
  Group,
  Table,
  Text,
  TextInput,
} from "@mantine/core";
import { CheckIcon } from "@phosphor-icons/react/Check";
import { PencilIcon } from "@phosphor-icons/react/Pencil";
import { TrashIcon } from "@phosphor-icons/react/Trash";
import { XIcon } from "@phosphor-icons/react/X";
import { useRouter } from "@tanstack/react-router";
import { useState } from "react";

import { useAsyncAction } from "@/app/client/hooks/useAsyncAction";
import { ItemTime } from "@/features/items/client/components/ItemTime";
import { useDeleteItem } from "@/features/items/client/hooks/useDeleteItem";
import { update } from "@/features/items/rpc";
import type { Item } from "@/features/items/shared/schemas/items";

import classes from "./ItemList.module.css";

export const ItemRow = ({ item }: { item: Item }) => {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(item.name);
  // Failures surface as toasts: a row is too small to carry a message, and the
  // row for a delete is gone by the time one arrives.
  const { pending, run } = useAsyncAction({ toast: true });
  const deleteItem = useDeleteItem(run);

  const trimmed = name.trim();
  const savable = trimmed.length > 0 && trimmed !== item.name;

  const handleToggle = (completed: boolean) =>
    run(async () => {
      await update({ data: { id: item.id, completed } });
      await router.invalidate();
    }, "Could not update the item.");

  const handleSave = () =>
    run(async () => {
      await update({ data: { id: item.id, name: trimmed } });
      await router.invalidate();
      setEditing(false);
    }, "Could not save the name.");

  const cancel = () => {
    setName(item.name);
    setEditing(false);
  };

  return (
    <Table.Tr>
      <Table.Td>
        <Checkbox
          checked={item.completed}
          disabled={pending}
          aria-label={`Mark ${item.name} ${
            item.completed ? "incomplete" : "complete"
          }`}
          onChange={(event) => void handleToggle(event.currentTarget.checked)}
        />
      </Table.Td>
      <Table.Td className={classes.nameColumn}>
        {editing ? (
          <TextInput
            aria-label="Name"
            value={name}
            disabled={pending}
            onChange={(event) => setName(event.currentTarget.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                cancel();
              }
              if (event.key === "Enter" && savable) {
                void handleSave();
              }
            }}
          />
        ) : (
          <Text truncate td={item.completed ? "line-through" : undefined}>
            {item.name}
          </Text>
        )}
      </Table.Td>
      <Table.Td className={classes.timeColumn}>
        <ItemTime item={item} />
      </Table.Td>
      <Table.Td>
        <Group gap="xs" justify="flex-end" wrap="nowrap">
          {editing ? (
            <>
              <ActionIcon
                variant="subtle"
                loading={pending}
                disabled={!savable}
                aria-label="Save name"
                onClick={() => void handleSave()}>
                <CheckIcon />
              </ActionIcon>
              <ActionIcon
                variant="subtle"
                color="gray"
                aria-label="Cancel editing"
                onClick={cancel}>
                <XIcon />
              </ActionIcon>
            </>
          ) : (
            <>
              <ActionIcon
                variant="subtle"
                disabled={pending}
                aria-label={`Edit ${item.name}`}
                onClick={() => setEditing(true)}>
                <PencilIcon />
              </ActionIcon>
              <ActionIcon
                variant="subtle"
                color="red"
                disabled={pending}
                aria-label={`Delete ${item.name}`}
                onClick={() => void deleteItem(item)}>
                <TrashIcon />
              </ActionIcon>
            </>
          )}
        </Group>
      </Table.Td>
    </Table.Tr>
  );
};
