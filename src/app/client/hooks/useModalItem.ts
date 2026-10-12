import { useState } from "react";

// The item a modal shows, kept through its close animation.
export const useModalItem = <T>() => {
  const [item, setItem] = useState<T | null>(null);
  const [opened, setOpened] = useState(false);
  const close = () => setOpened(false);
  return {
    item,
    open: (next: T) => {
      setItem(next);
      setOpened(true);
    },
    close,
    // Spread onto the Modal.
    props: { opened, onClose: close, onExitTransitionEnd: () => setItem(null) },
  };
};

export type ModalItem<T> = ReturnType<typeof useModalItem<T>>;
