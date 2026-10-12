import { describe, expect, it } from "vitest";

import {
  ITEM_PAGE_SIZE_DEFAULT,
  ITEM_PAGE_SIZES,
  itemSearchSchema,
  toItemResponse,
  updateItemInputSchema,
  updateItemSchema,
} from "@/features/items/shared/schemas/items";

describe("itemSearchSchema", () => {
  it("falls back to defaults when wrapped in catch", () => {
    const forgiving = itemSearchSchema.catch(() => itemSearchSchema.parse({}));

    expect(forgiving.parse({ page: -4 })).toEqual({
      page: 1,
      status: "all",
      size: ITEM_PAGE_SIZE_DEFAULT,
    });
  });
});

describe("updateItemSchema", () => {
  it("accepts a name alone", () => {
    expect(updateItemSchema.parse({ name: "Renamed" })).toEqual({
      name: "Renamed",
    });
  });

  it("accepts a completion flag alone", () => {
    expect(updateItemSchema.parse({ completed: true })).toEqual({
      completed: true,
    });
  });

  it("rejects an empty update", () => {
    expect(() => updateItemSchema.parse({})).toThrow();
  });
});

describe("updateItemInputSchema", () => {
  it("rejects an id with no fields to update", () => {
    expect(() => updateItemInputSchema.parse({ id: "abc" })).toThrow();
  });

  it("accepts an id with one field", () => {
    expect(updateItemInputSchema.parse({ id: "abc", completed: true })).toEqual(
      {
        id: "abc",
        completed: true,
      },
    );
  });
});

describe("toItemResponse", () => {
  it("maps a null completedAt through as null", () => {
    const response = toItemResponse({
      id: "abc",
      name: "Thing",
      completed: false,
      completedAt: null,
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      updatedAt: new Date("2026-01-02T00:00:00.000Z"),
    });

    expect(response.completedAt).toBeNull();
    expect(response.createdAt).toBe("2026-01-01T00:00:00.000Z");
  });

  it("serializes a completedAt as an ISO string", () => {
    const response = toItemResponse({
      id: "abc",
      name: "Thing",
      completed: true,
      completedAt: new Date("2026-01-03T00:00:00.000Z"),
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      updatedAt: new Date("2026-01-02T00:00:00.000Z"),
    });

    expect(response.completedAt).toBe("2026-01-03T00:00:00.000Z");
  });
});

describe("itemSearchSchema status", () => {
  it("defaults to all", () => {
    expect(itemSearchSchema.parse({}).status).toBe("all");
  });

  it("accepts the two filters", () => {
    expect(itemSearchSchema.parse({ status: "incomplete" }).status).toBe(
      "incomplete",
    );
    expect(itemSearchSchema.parse({ status: "complete" }).status).toBe(
      "complete",
    );
  });

  it("rejects an unknown status", () => {
    expect(() => itemSearchSchema.parse({ status: "pending" })).toThrow();
  });
});

describe("itemSearchSchema size", () => {
  it("defaults to the default page size", () => {
    expect(itemSearchSchema.parse({}).size).toBe(ITEM_PAGE_SIZE_DEFAULT);
  });

  it("accepts every allowed size as a string", () => {
    for (const size of ITEM_PAGE_SIZES) {
      expect(itemSearchSchema.parse({ size: String(size) }).size).toBe(size);
    }
  });

  // The bound is what keeps ?size=1000000 off the public REST endpoint.
  it("rejects a size outside the allowed set", () => {
    expect(() => itemSearchSchema.parse({ size: 1000000 })).toThrow();
    expect(() => itemSearchSchema.parse({ size: 15 })).toThrow();
  });
});
