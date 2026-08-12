import { TextInput } from "@mantine/core";
import type { ReactNode } from "react";

// Displayed, never edited: rendered as a read-only field rather than as text so
// it carries a real label and can be selected and copied.
export const SettingValue = ({
  label,
  value,
  description,
  error,
}: {
  label: string;
  value: string;
  description?: ReactNode;
  error?: ReactNode;
}) => (
  <TextInput
    label={label}
    description={description}
    error={error}
    readOnly
    value={value}
    onFocus={(event) => event.currentTarget.select()}
  />
);
