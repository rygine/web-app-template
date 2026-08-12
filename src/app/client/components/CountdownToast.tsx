import { Progress, Stack } from "@mantine/core";
import type { ReactNode } from "react";

import classes from "./CountdownToast.module.css";

// A toast's content with a bar draining over the window the toast is alive for.
// The duration is a prop rather than a constant read here, so the value that
// sets `autoClose` is the value that drives the bar — `timedToast` in
// `@/app/client/utils/toast` sets both from one, and is how this is rendered.
//
// The bar rides inside the message rather than on the toast root, which is what
// makes `notifications.update` behave: an update merges over what is already
// there, and replacing the message replaces the countdown with it, so a toast
// moving to an untimed state needs nothing cleared by hand.
export const CountdownToast = ({
  duration,
  color,
  children,
}: {
  duration: number;
  color: string | undefined;
  children: ReactNode;
}) => (
  <Stack gap="xs">
    {children}
    <Progress.Root
      size="xs"
      data-countdown
      style={{ "--countdown-duration": `${duration}ms` }}>
      <Progress.Section
        value={100}
        color={color}
        withAria={false}
        className={classes.bar}
      />
    </Progress.Root>
  </Stack>
);
