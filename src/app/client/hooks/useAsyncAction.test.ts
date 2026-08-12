// @vitest-environment jsdom
import { notifications, notificationsStore } from "@mantine/notifications";
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useAsyncAction } from "@/app/client/hooks/useAsyncAction";
import { ReportableError } from "@/app/shared/utils/errors";

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  notifications.clean();
});

const toasts = () => notificationsStore.getState().notifications;

describe("useAsyncAction", () => {
  it("starts idle", () => {
    const { result } = renderHook(() => useAsyncAction());

    expect(result.current.pending).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it("is pending until the action settles", async () => {
    const { result } = renderHook(() => useAsyncAction());
    const { promise: blocked, resolve: release } =
      Promise.withResolvers<void>();

    let ran: Promise<void>;

    act(() => {
      ran = result.current.run(() => blocked, "Could not save.");
    });

    expect(result.current.pending).toBe(true);

    await act(async () => {
      release();
      await ran;
    });

    expect(result.current.pending).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it("reports the caller's message and clears pending on failure", async () => {
    const { result } = renderHook(() => useAsyncAction());

    await act(async () => {
      await result.current.run(
        () => Promise.reject(new Error("connection refused")),
        "Could not save the name.",
      );
    });

    expect(result.current.pending).toBe(false);
    expect(result.current.error).toBe(
      "Could not save the name. Please try again.",
    );
    // Settings renders the message itself, so the default must stay silent.
    expect(toasts()).toHaveLength(0);
  });

  // The server writes a `ReportableError` for a person to read, and it is the
  // only caught value whose message this hook repeats.
  it("appends the reason a ReportableError carries", async () => {
    const { result } = renderHook(() => useAsyncAction());

    await act(async () => {
      await result.current.run(
        () =>
          Promise.reject(
            new ReportableError("Name must be 100 characters or fewer."),
          ),
        "Could not create the item.",
      );
    });

    expect(result.current.error).toBe(
      "Could not create the item. Name must be 100 characters or fewer.",
    );
  });

  // A request that never reached the server fails as a TypeError, and "Failed
  // to fetch" explains nothing to the person who typed the name.
  it("keeps a browser failure to itself", async () => {
    const { result } = renderHook(() => useAsyncAction());

    await act(async () => {
      await result.current.run(
        () => Promise.reject(new TypeError("Failed to fetch")),
        "Could not create the item.",
      );
    });

    expect(result.current.error).toBe(
      "Could not create the item. Please try again.",
    );
  });

  // Everything the framework raises client-side is a plain Error too, so the
  // class is the test rather than the shape of the message.
  it("keeps a plain Error to itself", async () => {
    const { result } = renderHook(() => useAsyncAction());

    await act(async () => {
      await result.current.run(
        () => Promise.reject(new Error("expected POST method. Got GET")),
        "Could not create the item.",
      );
    });

    expect(result.current.error).toBe(
      "Could not create the item. Please try again.",
    );
  });

  it("raises a timed toast when asked, and still reports the error", async () => {
    const { result } = renderHook(() => useAsyncAction({ toast: true }));

    await act(async () => {
      await result.current.run(
        () => Promise.reject(new Error("offline")),
        "Could not update the item.",
      );
    });

    expect(result.current.error).toBe(
      "Could not update the item. Please try again.",
    );
    expect(toasts()).toHaveLength(1);
    expect(toasts()[0]?.color).toBe("red");
    // A duration rather than the duration: the constant behind it belongs to
    // the toast component, and copying it here would be the second source the
    // countdown exists to avoid.
    expect(typeof toasts()[0]?.autoClose).toBe("number");
  });

  it("clears a previous error when run again", async () => {
    const { result } = renderHook(() => useAsyncAction());

    await act(async () => {
      await result.current.run(
        () => Promise.reject(new Error("first")),
        "Could not save.",
      );
    });

    expect(result.current.error).toBe("Could not save. Please try again.");

    await act(async () => {
      await result.current.run(() => Promise.resolve(), "Could not save.");
    });

    expect(result.current.error).toBeNull();
  });
});
