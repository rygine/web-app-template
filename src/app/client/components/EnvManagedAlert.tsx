import { Alert, Code } from "@mantine/core";
import type { ReactNode } from "react";

// Shown beside a control the environment has taken over, naming the variable
// to unset.
export const EnvManagedAlert = ({
  variable,
  children,
}: {
  variable: string;
  children: ReactNode;
}) => (
  <Alert color="blue" title="Set by the environment">
    <Code>{variable}</Code> is set, so {children}
  </Alert>
);
