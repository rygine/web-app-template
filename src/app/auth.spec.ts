import { E2E_API_KEY, E2E_BASE_URL } from "@/app/testing/db";
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
  const response = await call("/api/v1/items", { "X-Api-Key": "0".repeat(32) });

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

test("sends no CORS headers outside the API", async () => {
  const response = await call("/settings");

  expect(response.headers.get("access-control-allow-origin")).toBeNull();
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

test("rejects a cross-site write to a server function", async ({ page }) => {
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

  await page.goto("/items/new");
  // The dev server can issue a full reload once it finishes discovering
  // modules, which clears the field if the fill lands first.
  await page.waitForLoadState("networkidle");
  await page.getByLabel("Name").fill("csrf fixture");
  await page.getByRole("button", { name: "Create item" }).click();
  await expect(
    page.getByRole("cell", { name: "csrf fixture", exact: true }),
  ).toBeVisible();
  expect(endpoint).not.toBeNull();

  const forged = await fetch(endpoint!, {
    method: "POST",
    headers: { "content-type": "application/json", Origin: "http://evil.test" },
    body: payload!.replace("csrf fixture", "forged by another origin"),
  });

  expect(forged.status).toBe(403);
});

test("shows the key on the settings page", async ({ page }) => {
  await page.goto("/settings");

  await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
  await expect(
    page.getByRole("textbox", { name: "API key", exact: true }),
  ).toHaveValue(E2E_API_KEY);
});
