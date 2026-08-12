import { expect, seedItems, test } from "@/app/testing/e2e";

test("reports host values as environment-managed rather than editing them", async ({
  page,
}) => {
  await page.goto("/settings/general");

  const port = page.getByRole("textbox", { name: "Port", exact: true });
  await expect(port).toHaveAttribute("readonly", "");
  await expect(page.getByText("Set PORT before starting")).toBeVisible();

  const bind = page.getByRole("textbox", { name: "Bind address", exact: true });
  await expect(bind).toHaveAttribute("readonly", "");
});

test("redirects the bare settings path to general", async ({ page }) => {
  await page.goto("/settings");

  await expect(page).toHaveURL(/\/settings\/general$/);
  await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
});

test("autosaves the instance name and renders it in the navbar", async ({
  page,
}) => {
  await page.goto("/settings/general");

  const field = page.getByRole("textbox", {
    name: "Instance name",
    exact: true,
  });
  await field.fill("Coral Station");

  // No Save button: the navbar is what confirms the write landed.
  await expect(
    page.getByRole("navigation", { name: "Main" }).getByText("Coral Station"),
  ).toBeVisible();

  await page.reload();
  await expect(field).toHaveValue("Coral Station");

  // The row is a singleton shared by the whole run, so put it back.
  await field.fill("");
  await expect(
    page.getByRole("navigation", { name: "Main" }).getByText("Coral Station"),
  ).toBeHidden();
});

test("autosaves the log level and keeps it across a reload", async ({
  page,
}) => {
  await page.goto("/settings/general");

  const level = page.getByRole("combobox", { name: "Log level", exact: true });
  await level.click();
  await page.getByRole("option", { name: "info", exact: true }).click();

  await page.reload();
  await expect(level).toHaveValue("info");

  await level.click();
  await page.getByRole("option", { name: "debug", exact: true }).click();
});

test("changes what an item row renders when the time format changes", async ({
  page,
  request,
}) => {
  const name = `format probe ${Date.now()}`;
  await seedItems(request, [name]);

  await page.goto("/settings/ui");
  const relative = page.getByRole("switch", { name: "Show relative dates" });
  await relative.uncheck();

  const timeFormat = page.getByRole("combobox", {
    name: "Time format",
    exact: true,
  });
  await timeFormat.click();
  await page.getByRole("option", { name: /24-hour/ }).click();

  await page.goto("/items?status=all");
  const stamp = page.getByRole("button", {
    name: `Show timestamps for ${name}`,
    exact: true,
  });
  // 24-hour never carries an am/pm marker; 12-hour always does.
  await expect(stamp).not.toContainText(/[AP]M/i);

  await page.goto("/settings/ui");
  await timeFormat.click();
  await page.getByRole("option", { name: /12-hour/ }).click();
  await relative.check();
});

test("blocks navigation when a change could not be saved", async ({ page }) => {
  await page.goto("/settings/general");

  const field = page.getByRole("textbox", {
    name: "Instance name",
    exact: true,
  });

  await page.route("**/_serverFn/**", (route) => route.abort());
  await field.fill("Never Saved");

  await page
    .getByRole("navigation", { name: "Main" })
    .getByRole("link", { name: "UI", exact: true })
    .click();

  const modal = page.getByRole("dialog");
  await expect(
    modal.getByText("The last change could not be saved"),
  ).toBeVisible();

  // Staying is the default; leaving needs the explicit second action.
  await modal.getByRole("button", { name: "Stay" }).click();
  await expect(page).toHaveURL(/\/settings\/general$/);

  await page
    .getByRole("navigation", { name: "Main" })
    .getByRole("link", { name: "UI", exact: true })
    .click();
  await page.getByRole("button", { name: "Leave anyway" }).click();
  await expect(page).toHaveURL(/\/settings\/ui$/);
});
