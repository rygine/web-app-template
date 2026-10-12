import { describe, expect, it, vi } from "vitest";

import {
  gateDocument,
  isPublicFunction,
  refusesBody,
} from "@/app/server/utils/gate";

const signedIn = () => Promise.resolve(true);
const signedOut = () => Promise.resolve(false);

describe("gateDocument", () => {
  it.each(["/health", "/api/v1/items", "/_serverFn/abc"])(
    "leaves %s to its own checks",
    async (pathname) => {
      expect(
        await gateDocument({ pathname, hasUser: false, signedIn: signedOut }),
      ).toBe("allow");
    },
  );

  it("sends every page to setup until an account exists", async () => {
    expect(
      await gateDocument({
        pathname: "/items",
        hasUser: false,
        signedIn: signedIn,
      }),
    ).toBe("setup");
    expect(
      await gateDocument({
        pathname: "/setup",
        hasUser: false,
        signedIn: signedOut,
      }),
    ).toBe("allow");
  });

  it("closes setup once an account exists", async () => {
    expect(
      await gateDocument({
        pathname: "/setup",
        hasUser: true,
        signedIn: signedIn,
      }),
    ).toBe("login");
  });

  it("lets anyone reach the login page", async () => {
    expect(
      await gateDocument({
        pathname: "/login",
        hasUser: true,
        signedIn: signedOut,
      }),
    ).toBe("allow");
  });

  it("asks a signed-out visitor to log in", async () => {
    expect(
      await gateDocument({
        pathname: "/items",
        hasUser: true,
        signedIn: signedOut,
      }),
    ).toBe("login");
    expect(
      await gateDocument({
        pathname: "/items",
        hasUser: true,
        signedIn: signedIn,
      }),
    ).toBe("allow");
  });
});

describe("isPublicFunction", () => {
  it.each(["getShell", "login", "setup", "logout"])(
    "lets %s run without a session",
    (name) => {
      expect(isPublicFunction({ name, filename: "src/app/rpc.ts" })).toBe(true);
    },
  );

  it("guards every other function, including same names elsewhere", () => {
    expect(
      isPublicFunction({ name: "updateSettings", filename: "src/app/rpc.ts" }),
    ).toBe(false);
    expect(
      isPublicFunction({
        name: "login",
        filename: "src/features/items/rpc.ts",
      }),
    ).toBe(false);
  });
});

const post = (contentLength: string | null, signedInFn = signedOut) =>
  refusesBody({
    method: "POST",
    pathname: "/_serverFn/x",
    contentLength,
    signedIn: signedInFn,
  });

describe("refusesBody", () => {
  it("refuses a large or unsized body without a session", async () => {
    expect(await post("70000")).toBe(true);
    expect(await post(null)).toBe(true);
  });

  it("passes a small body without checking the session", async () => {
    const check = vi.fn(signedOut);

    expect(await post("200", check)).toBe(false);
    expect(check).not.toHaveBeenCalled();
  });

  it("passes any body once signed in", async () => {
    expect(await post("50000000", signedIn)).toBe(false);
  });

  it("leaves a GET and other paths alone", async () => {
    expect(
      await refusesBody({
        method: "GET",
        pathname: "/_serverFn/x",
        contentLength: null,
        signedIn: signedOut,
      }),
    ).toBe(false);
    expect(
      await refusesBody({
        method: "POST",
        pathname: "/api/v1/items",
        contentLength: null,
        signedIn: signedOut,
      }),
    ).toBe(false);
  });
});
