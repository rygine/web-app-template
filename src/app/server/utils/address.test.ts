import { describe, expect, it } from "vitest";

import { isLocalAddress } from "@/app/server/utils/address";

describe("isLocalAddress", () => {
  it.each([
    "127.0.0.1",
    "::1",
    "10.1.2.3",
    "172.16.0.1",
    "172.31.255.255",
    "192.168.1.5",
    "::ffff:192.168.1.5",
    "::ffff:127.0.0.1",
  ])("treats %s as local", (ip) => {
    expect(isLocalAddress(ip)).toBe(true);
  });

  it.each(["172.32.0.1", "8.8.8.8", "2001:db8::1", "not an ip", undefined])(
    "treats %s as remote",
    (ip) => {
      expect(isLocalAddress(ip)).toBe(false);
    },
  );
});
