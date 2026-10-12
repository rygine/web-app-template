import { Button, Group, Modal, Stack, Text } from "@mantine/core";
import type { useBlocker } from "@tanstack/react-router";

type Blocker = ReturnType<typeof useBlocker>;

// The blocker flushes before it decides, so reaching this modal means a write
// was attempted and failed — not merely that something was typed recently.
export const UnsavedChangesModal = ({ blocker }: { blocker: Blocker }) => (
  <Modal
    opened={blocker.status === "blocked"}
    onClose={() => blocker.reset?.()}
    title="This change was not saved"
    centered>
    <Stack>
      <Text size="sm">
        The last change could not be saved, so it is still only on this page.
        Leaving now discards it.
      </Text>
      <Group justify="flex-end">
        <Button variant="default" onClick={() => blocker.reset?.()}>
          Stay
        </Button>
        <Button color="red" onClick={() => blocker.proceed?.()}>
          Leave anyway
        </Button>
      </Group>
    </Stack>
  </Modal>
);
