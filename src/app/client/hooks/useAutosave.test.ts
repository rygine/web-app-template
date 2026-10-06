import { notifications } from "@mantine/notifications";
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AUTOSAVE_DELAY, useAutosave } from "@/app/client/hooks/useAutosave";

type Patch = { name: string; size: number };

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  notifications.clean();
});

const settle = async () => {
  await act(async () => {
    vi.advanceTimersByTime(AUTOSAVE_DELAY);
  });
};

describe("useAutosave", () => {
  it("starts clean", () => {
    const { result } = renderHook(() => useAutosave<Patch>(vi.fn(), "nope"));

    expect(result.current.dirty).toBe(false);
    expect(result.current.pending).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it("marks dirty as soon as a change is made", () => {
    const { result } = renderHook(() => useAutosave<Patch>(vi.fn(), "nope"));

    act(() => {
      result.current.commit({ name: "reef" });
    });

    expect(result.current.dirty).toBe(true);
  });

  it("saves after the pause and comes clean", async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useAutosave<Patch>(save, "nope"));

    act(() => {
      result.current.commit({ name: "reef" });
    });
    await settle();

    expect(save).toHaveBeenCalledExactlyOnceWith({ name: "reef" });
    expect(result.current.dirty).toBe(false);
  });

  it("coalesces changes made during the pause into one write", async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useAutosave<Patch>(save, "nope"));

    act(() => {
      result.current.commit({ name: "reef" });
      result.current.commit({ size: 2 });
      result.current.commit({ name: "farr" });
    });
    await settle();

    expect(save).toHaveBeenCalledExactlyOnceWith({ name: "farr", size: 2 });
  });

  it("keeps the failed patch so the next flush retries it", async () => {
    const save = vi
      .fn()
      .mockRejectedValueOnce(new Error("nope"))
      .mockResolvedValue(undefined);
    const { result } = renderHook(() =>
      useAutosave<Patch>(save, "Could not save."),
    );

    act(() => {
      result.current.commit({ name: "reef" });
    });
    await settle();
    await act(async () => {
      await result.current.flush();
    });

    expect(save).toHaveBeenNthCalledWith(2, { name: "reef" });
    expect(result.current.dirty).toBe(false);
  });

  it("resolves flush true when there is nothing queued", async () => {
    const save = vi.fn();
    const { result } = renderHook(() => useAutosave<Patch>(save, "nope"));

    let outcome = false;
    await act(async () => {
      outcome = await result.current.flush();
    });

    expect(outcome).toBe(true);
    expect(save).not.toHaveBeenCalled();
  });

  it("stays dirty when the save fails, and reports why", async () => {
    const save = vi.fn().mockRejectedValue(new Error("nope"));
    const { result } = renderHook(() =>
      useAutosave<Patch>(save, "Could not save."),
    );

    act(() => {
      result.current.commit({ name: "reef" });
    });
    await settle();

    expect(result.current.dirty).toBe(true);
    expect(result.current.error).toContain("Could not save.");
    expect(result.current.pending).toBe(false);
  });
});
