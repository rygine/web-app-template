import { Select } from "@mantine/core";
import type { ZodType } from "zod";

// A Select that writes at once: there is no more input coming after a pick.
// The schema is what keeps a stale option from ever reaching the store, and
// the value is held by the caller so the control answers its own click.
export const SettingSelect = <T extends string>({
  label,
  description,
  data,
  value,
  schema,
  disabled,
  maw,
  onChange,
}: {
  label: string;
  description?: string;
  data: { value: T; label: string }[];
  value: T;
  schema: ZodType<T>;
  disabled?: boolean;
  maw?: number;
  onChange: (value: T) => void;
}) => (
  <Select
    label={label}
    description={description}
    data={data}
    value={value}
    allowDeselect={false}
    disabled={disabled}
    maw={maw}
    onChange={(next) => {
      const parsed = schema.safeParse(next);
      if (parsed.success) {
        onChange(parsed.data);
      }
    }}
  />
);
