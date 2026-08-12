import { LAYOUT_WIDTH_COOKIE } from "@/app/shared/utils/width";
import type { LayoutWidth } from "@/app/shared/utils/width";

export const writeLayoutWidth = (width: LayoutWidth) => {
  document.cookie = `${LAYOUT_WIDTH_COOKIE}=${width}; Path=/; Max-Age=31536000; SameSite=Lax`;
};
