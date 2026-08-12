import { afterEach, describe, expect, it, vi } from "vitest";

import {
  clearLogLevel,
  createLogger,
  setLogLevel,
} from "@/app/shared/utils/log";

const original = process.env.LOG_LEVEL;

afterEach(() => {
  if (original === undefined) {
    delete process.env.LOG_LEVEL;
  } else {
    process.env.LOG_LEVEL = original;
  }
  clearLogLevel();
  vi.restoreAllMocks();
});

describe("setLogLevel", () => {
  it("supplies the level when the environment does not", () => {
    delete process.env.LOG_LEVEL;
    setLogLevel("error");
    const debug = vi.spyOn(console, "debug").mockImplementation(() => {});
    const error = vi.spyOn(console, "error").mockImplementation(() => {});

    const log = createLogger("items");
    log.debug("listing");
    log.error("boom");

    expect(debug).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalledOnce();
  });

  it("yields to the environment, which is what a deploy sets", () => {
    process.env.LOG_LEVEL = "debug";
    setLogLevel("off");
    const debug = vi.spyOn(console, "debug").mockImplementation(() => {});

    createLogger("items").debug("listing");

    expect(debug).toHaveBeenCalledOnce();
  });

  it("reaches a logger that was created before it was set", () => {
    delete process.env.LOG_LEVEL;
    const log = createLogger("items");
    setLogLevel("off");
    const error = vi.spyOn(console, "error").mockImplementation(() => {});

    log.error("boom");

    expect(error).not.toHaveBeenCalled();
  });

  it("moves every existing logger at once, not just quiet ones", () => {
    delete process.env.LOG_LEVEL;
    setLogLevel("debug");
    const debug = vi.spyOn(console, "debug").mockImplementation(() => {});
    const spoken = createLogger("spoken");
    const quiet = createLogger("quiet");

    // Only one of them has emitted anything when the level changes.
    spoken.debug("first");
    setLogLevel("off");
    spoken.debug("second");
    quiet.debug("first");

    expect(debug).toHaveBeenCalledOnce();
  });
});

describe("createLogger", () => {
  it("suppresses levels below the threshold", () => {
    process.env.LOG_LEVEL = "info";
    const debug = vi.spyOn(console, "debug").mockImplementation(() => {});

    createLogger("items").debug("listing");

    expect(debug).not.toHaveBeenCalled();
  });

  it("emits levels at or above the threshold", () => {
    process.env.LOG_LEVEL = "info";
    const info = vi.spyOn(console, "info").mockImplementation(() => {});

    createLogger("items").info("item.created", { id: "abc" });

    expect(info).toHaveBeenCalledOnce();
    expect(info.mock.calls[0]![0]).toBe("info  [items] item.created id=abc");
  });

  it("silences everything at off", () => {
    process.env.LOG_LEVEL = "off";
    const error = vi.spyOn(console, "error").mockImplementation(() => {});

    createLogger("items").error("boom");

    expect(error).not.toHaveBeenCalled();
  });

  it("passes Error fields through so stacks survive", () => {
    process.env.LOG_LEVEL = "error";
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const cause = new Error("connection refused");

    createLogger("ui").error("action failed", { error: cause });

    expect(error.mock.calls[0]![0]).toContain("error=connection refused");
    expect(error.mock.calls[0]![1]).toBe(cause);
  });

  it("emits to each handler it is given instead of the console", () => {
    process.env.LOG_LEVEL = "info";
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const first = vi.fn();
    const second = vi.fn();

    createLogger("items", first, second).info("item.created", { id: "abc" });

    expect(info).not.toHaveBeenCalled();
    for (const handler of [first, second]) {
      expect(handler).toHaveBeenCalledOnce();
      expect(handler.mock.calls[0]![0]).toMatchObject({
        level: "info",
        namespace: "items",
        message: "item.created",
        fields: { id: "abc" },
      });
    }
  });

  it("ignores an unrecognized level in favour of the default", () => {
    process.env.LOG_LEVEL = "verbose";
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    createLogger("items").warn("degraded");

    expect(warn).toHaveBeenCalledOnce();
  });
});
