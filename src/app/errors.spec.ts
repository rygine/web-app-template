import { expect, test } from "@/app/testing/e2e";

test("retries the failed loader rather than only clearing the error", async ({
  page,
}) => {
  await page.goto("/items?status=all");

  // Client-side navigation, so the loader's call is interceptable — a direct
  // goto would run it on the server, where page.route cannot reach.
  await page.route("**/_serverFn/**", (route) => route.abort());
  await page
    .getByRole("navigation", { name: "Main" })
    .getByRole("link", { name: "System", exact: true })
    .click();

  await expect(
    page.getByRole("heading", { name: "Something went wrong" }),
  ).toBeVisible();

  // The point of the case: `reset` would clear the boundary and the failed
  // loader would immediately throw again, so the button would look dead.
  await page.unroute("**/_serverFn/**");
  await page.getByRole("button", { name: "Try again" }).click();

  await expect(page.getByRole("heading", { name: "System" })).toBeVisible();
  await expect(page.getByText("Latest migration")).toBeVisible();
});

test("offers no destination it cannot justify", async ({ page }) => {
  await page.goto("/no-such-page");

  await expect(page.getByRole("heading", { name: "Not found" })).toBeVisible();
  // "Back to items" named one section arbitrarily once there were several.
  await expect(page.getByRole("link", { name: /back to/i })).toHaveCount(0);
});
