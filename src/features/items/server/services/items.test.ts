import { beforeEach, describe, expect, it } from "vitest";

import { prisma } from "@/app/server/utils/prisma";
import { NotFoundError } from "@/app/shared/utils/errors";
import {
  createItem,
  deleteItem,
  getItem,
  listItems,
  updateItem,
} from "@/features/items/server/services/items";

const seed = async (names: string[]) => {
  for (const [index, name] of names.entries()) {
    await prisma.item.create({
      data: { name, createdAt: new Date(Date.UTC(2026, 0, 1, index)) },
    });
  }
};

beforeEach(async () => {
  expect(process.env.DATA_DIR).toContain(".tmp/test");
  await prisma.item.deleteMany();
});

describe("listItems", () => {
  it("returns items newest first", async () => {
    await seed(["oldest", "newest"]);

    const { items, total, pageCount } = await listItems({});

    expect(items.map((item) => item.name)).toEqual(["newest", "oldest"]);
    expect(total).toBe(2);
    expect(pageCount).toBe(1);
  });

  it("pages at ten items", async () => {
    await seed(Array.from({ length: 12 }, (_, index) => `item ${index}`));

    const first = await listItems({});
    const second = await listItems({ page: 2 });

    expect(first.items).toHaveLength(10);
    expect(second.items).toHaveLength(2);
    expect(first.total).toBe(12);
    expect(first.pageCount).toBe(2);
  });

  it("reports a page count of zero when empty", async () => {
    const { items, total, pageCount } = await listItems({});

    expect(items).toEqual([]);
    expect(total).toBe(0);
    expect(pageCount).toBe(0);
  });
});

describe("getItem", () => {
  it("returns the item", async () => {
    const created = await createItem({ name: "Findable" });

    const found = await getItem(created.id);

    expect(found.name).toBe("Findable");
  });

  it("throws NotFoundError for a missing id", async () => {
    await expect(getItem("does-not-exist")).rejects.toThrow(NotFoundError);
  });
});

describe("createItem", () => {
  it("persists the item", async () => {
    const created = await createItem({ name: "Fresh" });

    const row = await prisma.item.findUnique({ where: { id: created.id } });

    expect(row!.name).toBe("Fresh");
  });
});

describe("updateItem", () => {
  it("updates the name", async () => {
    const created = await createItem({ name: "Before" });

    const updated = await updateItem(created.id, { name: "After" });

    expect(updated.name).toBe("After");
  });

  it("throws NotFoundError for a missing id", async () => {
    await expect(updateItem("does-not-exist", { name: "x" })).rejects.toThrow(
      NotFoundError,
    );
  });
});

describe("deleteItem", () => {
  it("removes the row", async () => {
    const created = await createItem({ name: "Doomed" });

    await deleteItem(created.id);

    expect(await prisma.item.count()).toBe(0);
  });

  it("throws NotFoundError for a missing id", async () => {
    await expect(deleteItem("does-not-exist")).rejects.toThrow(NotFoundError);
  });
});

describe("item completion", () => {
  it("creates an incomplete item with no completedAt", async () => {
    const item = await createItem({ name: "Fresh" });

    expect(item.completed).toBe(false);
    expect(item.completedAt).toBeNull();
  });

  it("creates a complete item with a completedAt", async () => {
    const item = await createItem({ name: "Already done", completed: true });

    expect(item.completed).toBe(true);
    expect(item.completedAt).toBeInstanceOf(Date);
  });

  it("stamps completedAt when completing", async () => {
    const created = await createItem({ name: "To do" });
    const updated = await updateItem(created.id, { completed: true });

    expect(updated.completed).toBe(true);
    expect(updated.completedAt).toBeInstanceOf(Date);
  });

  it("clears completedAt when un-completing", async () => {
    const created = await createItem({ name: "To do", completed: true });
    const updated = await updateItem(created.id, { completed: false });

    expect(updated.completed).toBe(false);
    expect(updated.completedAt).toBeNull();
  });

  it("leaves completedAt alone when only the name changes", async () => {
    const created = await createItem({ name: "To do", completed: true });
    const updated = await updateItem(created.id, { name: "Renamed" });

    expect(updated.name).toBe("Renamed");
    expect(updated.completedAt).toEqual(created.completedAt);
  });

  it("rejects an update with no fields", async () => {
    const created = await createItem({ name: "To do" });

    await expect(updateItem(created.id, {})).rejects.toThrow();
  });
});

const seedMixed = async () => {
  await createItem({ name: "open one" });
  await createItem({ name: "open two" });
  await createItem({ name: "closed one", completed: true });
};

describe("listItems status filter", () => {
  it("returns everything by default", async () => {
    await seedMixed();

    expect((await listItems({})).total).toBe(3);
  });

  it("returns only incomplete items", async () => {
    await seedMixed();

    const { items, total, pageCount } = await listItems({
      status: "incomplete",
    });

    expect(items.map((item) => item.name).toSorted()).toEqual([
      "open one",
      "open two",
    ]);
    expect(total).toBe(2);
    expect(pageCount).toBe(1);
  });

  it("returns only complete items", async () => {
    await seedMixed();

    const { items, total } = await listItems({ status: "complete" });

    expect(items.map((item) => item.name)).toEqual(["closed one"]);
    expect(total).toBe(1);
  });
});

describe("listItems page size", () => {
  it("honours size for the page and the page count", async () => {
    await seed(Array.from({ length: 12 }, (_, index) => `sized ${index}`));

    const wide = await listItems({ size: 25 });
    const narrow = await listItems({ size: 10, page: 2 });

    expect(wide.items).toHaveLength(12);
    expect(wide.pageCount).toBe(1);
    expect(narrow.items).toHaveLength(2);
    expect(narrow.pageCount).toBe(2);
  });
});
