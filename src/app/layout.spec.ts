import type { Page } from "@playwright/test";
import pkg from "~/package.json" with { type: "json" };

import { expect, seedItems, test } from "@/app/testing/e2e";

const mainBox = async (page: Page) => {
  const box = await page.locator("main").boundingBox();
  expect(box).not.toBeNull();
  return box!;
};

const scrollTop = (page: Page) => page.evaluate(() => Math.round(scrollY));

const maxScroll = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollHeight - innerHeight);

// the width the layout centers in, without a classic scrollbar's gutter
const layoutWidth = (page: Page) =>
  page.evaluate(() => document.body.clientWidth);

const navBox = async (page: Page) => {
  const box = await page
    .getByRole("navigation", { name: "Main" })
    .boundingBox();
  expect(box).not.toBeNull();
  return box!;
};

test("centers the content column and attaches the navbar to it", async ({
  page,
}) => {
  await page.goto("/items");

  // 1280 leaves --layout-offset at 0; 1600 clamps --layout-aside instead.
  for (const width of [1280, 1600]) {
    await page.setViewportSize({ width, height: 720 });

    const main = await mainBox(page);
    const nav = await navBox(page);

    const leftGutter = main.x;
    const rightGutter = (await layoutWidth(page)) - (main.x + main.width);
    expect(Math.abs(leftGutter - rightGutter)).toBeLessThanOrEqual(1);

    expect(Math.abs(nav.x + nav.width - main.x)).toBeLessThanOrEqual(1);
  }
});

test("shows the app name and version in the navbar", async ({ page }) => {
  await page.goto("/items");

  const nav = page.getByRole("navigation", { name: "Main" });

  await expect(nav.getByText(pkg.name)).toBeVisible();
  await expect(nav.getByText(/^v\d+\.\d+\.\d+$/)).toBeVisible();
});

test("navigates between sections from the navbar", async ({ page }) => {
  await page.goto("/items");

  await page
    .getByRole("navigation", { name: "Main" })
    .getByRole("link", { name: "Settings" })
    .click();

  await expect(page).toHaveURL(/\/settings\/general$/);
});

test("matches the content header height to the navbar header", async ({
  page,
}) => {
  await page.goto("/items");

  const navHeader = await page
    .getByRole("navigation", { name: "Main" })
    .getByText(pkg.name)
    .boundingBox();
  const title = await page
    .getByRole("heading", { name: "Items", level: 1 })
    .boundingBox();

  expect(navHeader).not.toBeNull();
  expect(title).not.toBeNull();

  const navCentre = navHeader!.y + navHeader!.height / 2;
  const titleCentre = title!.y + title!.height / 2;
  expect(Math.abs(navCentre - titleCentre)).toBeLessThanOrEqual(2);
});

// Asserting the layout attribute rather than the menu's own checkmark keeps
// this pinned to the state the geometry depends on.
const expectWidth = async (page: Page, width: string) => {
  await expect(page.locator("[data-layout-width]")).toHaveAttribute(
    "data-layout-width",
    width,
  );
};

const setWidth = async (page: Page, label: "Normal" | "Wide" | "Full") => {
  await page.getByRole("button", { name: "Content width" }).click();
  await page.getByRole("menuitem", { name: label }).click();
  await expectWidth(page, label.toLowerCase());
};

test("wide grows the content, shrinks the navbar, and stays centered", async ({
  page,
}) => {
  await page.goto("/items");

  const before = await mainBox(page);
  const navBefore = await navBox(page);

  await setWidth(page, "Wide");

  const after = await mainBox(page);
  const navAfter = await navBox(page);

  expect(after.width).toBeGreaterThan(before.width);
  expect(navAfter.width).toBeLessThanOrEqual(navBefore.width);
  expect(Math.abs(navAfter.x + navAfter.width - after.x)).toBeLessThanOrEqual(
    1,
  );

  const leftGutter = after.x;
  const rightGutter = (await layoutWidth(page)) - (after.x + after.width);
  expect(Math.abs(leftGutter - rightGutter)).toBeLessThanOrEqual(1);
});

test("full stops centering and fills the space beside the navbar", async ({
  page,
}) => {
  await page.goto("/items");

  await setWidth(page, "Full");

  const main = await mainBox(page);
  const nav = await navBox(page);

  expect(nav.x).toBeLessThanOrEqual(1);
  expect(Math.abs(main.x - nav.width)).toBeLessThanOrEqual(1);
  expect(
    Math.abs(main.x + main.width - (await layoutWidth(page))),
  ).toBeLessThanOrEqual(1);
});

test("the width survives a reload and reaches a new tab", async ({
  page,
  context,
}) => {
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") {
      consoleErrors.push(message.text());
    }
  });

  await page.goto("/items");
  await setWidth(page, "Wide");

  const response = await context.request.get("/items");
  const html = await response.text();
  expect(html).toContain('data-layout-width="wide"');

  await page.reload();
  await expectWidth(page, "wide");

  // The menu marks the active width with aria-current, since Menu.Item forces
  // role="menuitem" and aria-checked would be invalid on it.
  await page.getByRole("button", { name: "Content width" }).click();
  await expect(page.getByRole("menuitem", { name: "Wide" })).toHaveAttribute(
    "aria-current",
    "true",
  );
  await expect(page.getByRole("menuitem", { name: "Full" })).toHaveAttribute(
    "aria-current",
    "false",
  );
  await page.keyboard.press("Escape");

  const fresh = await context.newPage();
  await fresh.goto("/items");
  await expectWidth(fresh, "wide");
  await fresh.close();

  expect(consoleErrors.filter((text) => /hydrat/i.test(text))).toEqual([]);
});

test.describe("content scrolling", () => {
  // Short enough that one page of items overflows the content area.
  test.use({ viewport: { width: 1100, height: 420 } });

  test("keeps the header pinned, resets on navigation, restores on back", async ({
    page,
    request,
  }) => {
    // A full page of items is what makes the content area overflow. Seeded
    // here rather than assumed, so the test stands up on an empty database.
    await seedItems(
      request,
      Array.from({ length: 10 }, (_, index) => `scroll item ${index}`),
    );

    await page.goto("/items");

    // Hydration and the router's own scroll pass both run after first paint,
    // so scrolling before the document actually overflows is silently undone.
    await expect.poll(() => maxScroll(page)).toBeGreaterThan(0);

    // Derived rather than hardcoded: how far one page of items overflows
    // depends on the viewport and on Mantine's spacing.
    const target = await maxScroll(page);
    const before = await page.locator("header").boundingBox();
    await page.evaluate((y) => scrollTo(0, y), target);
    await expect.poll(() => scrollTop(page)).toBe(target);

    // The header is sticky, so it stays at the top of the viewport while the
    // document scrolls underneath it.
    const after = await page.locator("header").boundingBox();
    expect(after!.y).toBe(before!.y);
    expect(after!.y).toBe(0);

    const nav = page.getByRole("navigation", { name: "Main" });
    await nav.getByRole("link", { name: "Settings" }).click();
    await expect(page).toHaveURL(/\/settings\/general$/);

    // A page you have not opened before must start at the top.
    await expect.poll(() => scrollTop(page)).toBe(0);

    // The list route normalises its search params, so the history entry is
    // /items?page=1 rather than /items.
    await page.goBack();
    await expect(page).toHaveURL(/\/items(\?|$)/);
    await expect.poll(() => scrollTop(page)).toBe(target);
  });
});

test.describe("color scheme", () => {
  test.use({ colorScheme: "light" });

  test("toggles the scheme, swaps the icon, and survives a reload", async ({
    page,
  }) => {
    const consoleErrors: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error") {
        consoleErrors.push(message.text());
      }
    });

    await page.goto("/items");

    const html = page.locator("html");
    const toDark = page.getByRole("button", { name: "Switch to dark theme" });
    const toLight = page.getByRole("button", { name: "Switch to light theme" });

    // Both buttons are always in the DOM and CSS hides one. Asserting the
    // hidden one is absent from the accessibility tree is what proves the
    // swap happens without a render-time branch on the scheme — and pins the
    // direction, since the icon names the scheme a click switches to.
    await expect(html).toHaveAttribute("data-mantine-color-scheme", "light");
    await expect(toDark).toBeVisible();
    await expect(toLight).toHaveCount(0);

    await toDark.click();

    await expect(html).toHaveAttribute("data-mantine-color-scheme", "dark");
    await expect(toLight).toBeVisible();
    await expect(toDark).toHaveCount(0);

    await page.reload();
    await expect(html).toHaveAttribute("data-mantine-color-scheme", "dark");
    await expect(toLight).toBeVisible();

    expect(consoleErrors.filter((text) => /hydrat/i.test(text))).toEqual([]);
  });
});

test.describe("mobile", () => {
  test.use({ viewport: { width: 375, height: 667 } });

  test("hides the navbar behind a burger and keeps the page title", async ({
    page,
  }) => {
    await page.goto("/items");

    const nav = page.getByRole("navigation", { name: "Main" });
    const burger = page.getByRole("button", { name: "Open navigation" });

    await expect(burger).toBeVisible();
    await expect(nav).toBeHidden();

    // The brand belongs to the navbar, so the header keeps showing the title
    // rather than swapping it out for the app name and version.
    await expect(
      page.getByRole("heading", { name: "Items", level: 1 }),
    ).toBeVisible();
    await expect(
      page.getByRole("main").getByText(/^v\d+\.\d+\.\d+$/),
    ).toHaveCount(0);

    await burger.click();
    await expect(nav).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(nav).toBeHidden();
  });

  test("closes the drawer when a link is followed", async ({ page }) => {
    await page.goto("/items");

    await page.getByRole("button", { name: "Open navigation" }).click();
    await page
      .getByRole("navigation", { name: "Main" })
      .getByRole("link", { name: "Settings" })
      .click();

    await expect(page).toHaveURL(/\/settings\/general$/);
    await expect(page.getByRole("navigation", { name: "Main" })).toBeHidden();
  });
});

test("leaves nothing covering the page after growing past the breakpoint", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 667 });
  await page.goto("/items");
  await page.getByRole("button", { name: "Open navigation" }).click();

  await page.setViewportSize({ width: 1280, height: 720 });

  // A trial click runs the actionability checks without navigating, so this
  // fails if anything is covering the navbar.
  await page
    .getByRole("navigation", { name: "Main" })
    .getByRole("link", { name: "Settings" })
    .click({ trial: true });
});
