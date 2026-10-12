import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { useModalItem } from "@/app/client/hooks/useModalItem";

describe("useModalItem", () => {
  it("starts closed with no item", () => {
    const { result } = renderHook(() => useModalItem<string>());

    expect(result.current.item).toBeNull();
    expect(result.current.props.opened).toBe(false);
  });

  it("keeps the item through the close until the exit transition ends", () => {
    const { result } = renderHook(() => useModalItem<string>());

    act(() => result.current.open("backup.zip"));
    expect(result.current.props.opened).toBe(true);
    expect(result.current.item).toBe("backup.zip");

    act(() => result.current.props.onClose());
    expect(result.current.props.opened).toBe(false);
    expect(result.current.item).toBe("backup.zip");

    act(() => result.current.props.onExitTransitionEnd());
    expect(result.current.item).toBeNull();
  });
});
