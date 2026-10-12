import { Button, Group, Modal, Stack, Text } from "@mantine/core";
import { useRouter } from "@tanstack/react-router";
import type { ReactNode } from "react";

import { useAsyncAction } from "@/app/client/hooks/useAsyncAction";
import type { ModalItem } from "@/app/client/hooks/useModalItem";

// Open while target is set. A delete reloads the route's data, then closes.
export const ConfirmDeleteModal = <T,>({
  target,
  title,
  label,
  failure,
  onDelete,
  children,
}: {
  target: ModalItem<T>;
  title: string;
  label: string;
  failure: string;
  onDelete: (item: T) => Promise<void>;
  children: ReactNode;
}) => {
  const router = useRouter();
  const remove = useAsyncAction({ toast: true });
  return (
    <Modal {...target.props} title={title} centered>
      <Stack>
        <Text size="sm">{children}</Text>
        <Group justify="flex-end">
          <Button variant="default" onClick={target.close}>
            Cancel
          </Button>
          <Button
            color="red"
            loading={remove.pending}
            onClick={() =>
              void remove.run(async () => {
                if (target.item !== null) {
                  await onDelete(target.item);
                  await router.invalidate();
                }
                target.close();
              }, failure)
            }>
            {label}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
};
