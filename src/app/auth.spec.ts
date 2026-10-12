import type { Page } from "@playwright/test";

import {
  E2E_API_KEY,
  E2E_BASE_URL,
  E2E_PASSWORD,
  E2E_USERNAME,
} from "@/app/testing/db";
import { expect, test } from "@/app/testing/e2e";

const call = (path: string, headers?: Record<string, string>) =>
  fetch(new URL(path, E2E_BASE_URL), { headers });

test("rejects a request with no key", async () => {
  const response = await call("/api/v1/items");

  expect(response.status).toBe(401);

  const body = await response.json();

  expect(body.error.code).toBe("unauthorized");
});

test("rejects a wrong key of the same length", async () => {
  const response = await call("/api/v1/items", {
    "X-Api-Key": "0".repeat(32),
  });

  expect(response.status).toBe(401);
});

test("accepts the key as a header", async () => {
  const response = await call("/api/v1/items", { "X-Api-Key": E2E_API_KEY });

  expect(response.status).toBe(200);
});

test("rejects the key as an apikey query parameter", async () => {
  const response = await call(
    `/api/v1/items?apikey=${encodeURIComponent(E2E_API_KEY)}`,
  );

  expect(response.status).toBe(401);
});

test("rejects an unauthenticated write", async () => {
  const response = await fetch(new URL("/api/v1/items", E2E_BASE_URL), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "should not exist" }),
  });

  expect(response.status).toBe(401);
});

test("answers a CORS preflight without a key", async () => {
  const response = await fetch(new URL("/api/v1/items", E2E_BASE_URL), {
    method: "OPTIONS",
    headers: {
      Origin: "https://example.com",
      "Access-Control-Request-Method": "POST",
    },
  });

  expect(response.status).toBe(204);
  expect(response.headers.get("access-control-allow-origin")).toBe("*");
  expect(response.headers.get("access-control-allow-headers")).toContain(
    "X-Api-Key",
  );
});

test("rejects an undefined method with 405 and no key", async () => {
  const response = await fetch(new URL("/api/v1/items", E2E_BASE_URL), {
    method: "PATCH",
  });

  expect(response.status).toBe(405);
  expect(response.headers.get("allow")).toBe("GET, POST");
  expect((await response.json()).error.code).toBe("method_not_allowed");
});

test("leaves health unauthenticated", async () => {
  const response = await call("/health");

  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ ok: true });
});

test("rejects a cross-site write, and a write without a session, to a server function", async ({
  page,
  context,
}) => {
  let endpoint: string | null = null;
  let payload: string | null = null;

  page.on("request", (request) => {
    if (
      endpoint === null &&
      request.method() === "POST" &&
      request.url().includes("/_serverFn/")
    ) {
      endpoint = request.url();
      payload = request.postData();
    }
  });

  await page.goto("/settings/general");
  await page.waitForLoadState("networkidle");
  const name = page.getByRole("textbox", { name: "Instance name" });
  await name.fill("csrf fixture");
  await name.blur();
  await expect.poll(() => endpoint).not.toBeNull();

  const cookie = (await context.cookies())
    .map(({ name: key, value }) => `${key}=${value}`)
    .join("; ");
  const forged = await fetch(endpoint!, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      Origin: "http://evil.test",
      Cookie: cookie,
    },
    body: payload!.replace("csrf fixture", "forged by another origin"),
  });

  expect(forged.status).toBe(403);

  // A write without a session gets the message, not a redirect, so its toast can show it.
  const anonymous = await fetch(endpoint!, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      Origin: new URL(E2E_BASE_URL).origin,
    },
    body: payload!.replace("csrf fixture", "written without a session"),
  });
  expect(anonymous.status).toBe(200);
  expect(anonymous.redirected).toBe(false);
  expect(await anonymous.text()).toContain(
    "Your session has ended. Log in again.",
  );

  // The row is a singleton shared by the whole run, so put it back.
  await name.fill("");
  await expect(
    page.getByRole("navigation", { name: "Main" }).getByText("csrf fixture"),
  ).toBeHidden();
});

test("refuses a large server function body without a session", async () => {
  const response = await fetch(new URL("/_serverFn/x", E2E_BASE_URL), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      Origin: new URL(E2E_BASE_URL).origin,
    },
    body: "x".repeat(70_000),
  });

  expect(response.status).toBe(413);
});

test("shows the key on the settings page", async ({ page }) => {
  await page.goto("/settings/security");

  await expect(page.getByRole("heading", { name: "Security" })).toBeVisible();
  await expect(
    page.getByRole("textbox", { name: "API key", exact: true }),
  ).toHaveValue(E2E_API_KEY);
});

const logIn = async (page: Page) => {
  await page.waitForLoadState("networkidle");
  await page.getByRole("textbox", { name: "Username" }).fill(E2E_USERNAME);
  await page
    .getByRole("textbox", { name: "Password", exact: true })
    .fill(E2E_PASSWORD);
  await page.getByRole("button", { name: "Log in" }).click();
};

test.describe("signed out", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("sends a visitor to the login page and back", async ({ page }) => {
    await page.goto("/settings/general");
    await expect(page).toHaveURL(/\/login\?redirect=%2Fsettings%2Fgeneral$/);

    await logIn(page);

    await expect(page).toHaveURL(/\/settings\/general$/);
  });

  test("rejects a wrong password", async ({ page }) => {
    await page.goto("/login");
    await page.waitForLoadState("networkidle");
    await page.getByRole("textbox", { name: "Username" }).fill(E2E_USERNAME);
    await page
      .getByRole("textbox", { name: "Password", exact: true })
      .fill("wrong password");
    await page.getByRole("button", { name: "Log in" }).click();

    await expect(page.getByRole("alert")).toHaveText(
      "Could not log in. The username or password is incorrect.",
    );
  });

  test("closes setup once an account exists", async ({ page }) => {
    await page.goto("/setup");

    await expect(page).toHaveURL(/\/login$/);
  });

  // Its own login, so the suite's shared session survives.
  test("logs out", async ({ page }) => {
    await page.goto("/login");
    await logIn(page);
    await expect(page).not.toHaveURL(/\/login/);

    const nav = page.getByRole("navigation", { name: "Main" });
    await nav.getByRole("link", { name: "System", exact: true }).click();
    await nav.getByRole("button", { name: "Log out" }).click();
    await expect(page).toHaveURL(/\/login$/);

    await page.goto("/settings/general");
    await expect(page).toHaveURL(/\/login\?redirect=/);
  });
});

test("lets a local address in without a login when allowed", async ({
  page,
  browser,
}) => {
  const requireLogin = page.getByRole("combobox", { name: "Require login" });
  await page.goto("/settings/security");
  await requireLogin.click();
  await page
    .getByRole("option", { name: "Except from local addresses" })
    .click();
  await page.waitForLoadState("networkidle");

  try {
    const anonymous = await browser.newContext({
      baseURL: E2E_BASE_URL,
      storageState: { cookies: [], origins: [] },
    });
    const visitor = await anonymous.newPage();
    await visitor.goto("/settings/general");

    await expect(visitor).toHaveURL(/\/settings\/general$/);
    await anonymous.close();
  } finally {
    await requireLogin.click();
    await page.getByRole("option", { name: "Always" }).click();
    await page.waitForLoadState("networkidle");
  }
});

test.describe("an ended session", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("sends the next navigation to the login page", async ({ page }) => {
    await page.goto("/login");
    await logIn(page);
    await page.waitForURL((url) => !url.pathname.startsWith("/login"));
    await page.goto("/items");
    await page.waitForLoadState("networkidle");

    // Clearing cookies ends the session without logging the suite's session out.
    await page.context().clearCookies();
    await page
      .getByRole("navigation", { name: "Main" })
      .getByRole("link", { name: "Settings", exact: true })
      .click();

    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByRole("button", { name: "Log in" })).toBeVisible();
  });
});
