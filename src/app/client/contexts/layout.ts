import { createContext, useContext } from "react";

import type { LayoutWidth } from "@/app/shared/utils/width";

export type LayoutContextValue = {
  navOpen: boolean;
  openNav: () => void;
  closeNav: () => void;
  width: LayoutWidth;
  setWidth: (width: LayoutWidth) => void;
};

export const LayoutContext = createContext<LayoutContextValue | null>(null);

export const useLayout = () => {
  const value = useContext(LayoutContext);
  if (value === null) {
    throw new Error("useLayout must be called inside MainLayout");
  }
  return value;
};
