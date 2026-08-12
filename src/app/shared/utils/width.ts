import { z } from "zod";

export const LAYOUT_WIDTH_COOKIE = "layout-width";

export const layoutWidthSchema = z.enum(["normal", "wide", "full"]);

export type LayoutWidth = z.infer<typeof layoutWidthSchema>;

const LABELS: Record<LayoutWidth, string> = {
  normal: "Normal",
  wide: "Wide",
  full: "Full",
};

// Derived from the enum, so the menu and the settings page cannot list a width
// the schema would reject.
export const LAYOUT_WIDTH_OPTIONS = layoutWidthSchema.options.map((value) => ({
  value,
  label: LABELS[value],
}));

export const parseLayoutWidth = (value: string | undefined): LayoutWidth =>
  layoutWidthSchema.catch("normal").parse(value);
