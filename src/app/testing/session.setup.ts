import { expect, test as setup } from "@playwright/test";

import { E2E_PASSWORD, E2E_SESSION_FILE, E2E_USERNAME } from "@/app/testing/db";

setup("signs in once for the suite", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/(setup|login)/);
  // The dev server can reload once it finishes discovering modules.
  await page.waitForLoadState("networkidle");

  const creating = page.url().includes("/setup");
  await page.getByRole("textbox", { name: "Username" }).fill(E2E_USERNAME);
  await page
    .getByRole("textbox", { name: "Password", exact: true })
    .fill(E2E_PASSWORD);
  if (creating) {
    await page
      .getByRole("textbox", { name: "Confirm password" })
      .fill(E2E_PASSWORD);
  }
  await page
    .getByRole("button", { name: creating ? "Create account" : "Log in" })
    .click();
  await expect(page).not.toHaveURL(/\/(setup|login)/);

  await page.context().storageState({ path: E2E_SESSION_FILE });
});
