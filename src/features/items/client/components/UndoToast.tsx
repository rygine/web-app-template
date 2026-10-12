import { Button, Group, Text } from "@mantine/core";
import type { ReactNode } from "react";

import classes from "./UndoToast.module.css";

// The body of the one toast a delete raises, in each of the states it passes
// through: the offer, the restore in flight, and a failure that puts the offer
// back. `onRestore` is what separates them — the in-flight state omits it, so a
// second click is structurally impossible rather than merely discouraged.
export const UndoToast = ({
  message,
  onRestore,
}: {
  message: ReactNode;
  onRestore?: () => void;
}) => (
  <Group justify="space-between" wrap="nowrap">
    <Text size="sm" className={classes.message}>
      {message}
    </Text>
    {onRestore === undefined ? null : (
      <Button size="xs" flex="0 0 auto" onClick={onRestore}>
        Restore
      </Button>
    )}
  </Group>
);
