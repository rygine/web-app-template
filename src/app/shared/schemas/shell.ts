import type { Settings } from "@/app/shared/schemas/settings";
import type { LayoutWidth } from "@/app/shared/utils/width";

// Everything the shell renders before any page does: the navbar, the document
// title, and the timestamps inside a row.
export type ShellView = Pick<
  Settings,
  "shortDateFormat" | "longDateFormat" | "timeFormat" | "showRelativeDates"
> & {
  width: LayoutWidth;
  instanceName: string;
};
