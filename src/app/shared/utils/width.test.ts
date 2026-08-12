import { describe, expect, it } from "vitest";

import { parseLayoutWidth } from "@/app/shared/utils/width";

describe("parseLayoutWidth", () => {
  it("accepts every known width", () => {
    expect(parseLayoutWidth("normal")).toBe("normal");
    expect(parseLayoutWidth("wide")).toBe("wide");
    expect(parseLayoutWidth("full")).toBe("full");
  });

  it("falls back to normal for an unknown value", () => {
    expect(parseLayoutWidth("enormous")).toBe("normal");
  });

  it("falls back to normal when the cookie is absent", () => {
    expect(parseLayoutWidth(undefined)).toBe("normal");
  });
});
