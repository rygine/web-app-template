import { describe, expect, it } from "vitest";

import { formatBytes, formatEta } from "@/app/shared/utils/format";

describe("formatBytes", () => {
  it.each([
    [999, "999 B"],
    [1_500_000, "1.5 MB"],
    [5_000_000_000, "5.0 GB"],
    [60_000_000_000_000, "60.00 TB"],
    [-500, "-500 B"],
    [-200_000_000, "-200.0 MB"],
  ])("formats %d as %s", (bytes, text) => {
    expect(formatBytes(bytes)).toBe(text);
  });
});

describe("formatEta", () => {
  it.each([
    [0, "under a minute"],
    [59, "under a minute"],
    [240, "4 min"],
    [5400, "1 h 30 min"],
    [7200, "2 h"],
  ])("formats %d seconds as %s", (seconds, text) => {
    expect(formatEta(seconds)).toBe(text);
  });
});
