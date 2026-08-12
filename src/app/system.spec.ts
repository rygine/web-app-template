import { E2E_BASE_URL } from "@/app/testing/db";
import { expect, test } from "@/app/testing/e2e";

test("reports what the instance is and how long it has been up", async ({
  page,
}) => {
  await page.goto("/system");

  await expect(page.getByRole("heading", { name: "System" })).toBeVisible();
  await expect(page.getByText("Version")).toBeVisible();
  await expect(page.getByText("Running since")).toBeVisible();
  await expect(page.getByText("Latest migration")).toBeVisible();

  // The migration name is read from the database, not written into the page.
  await expect(page.getByText(/^\d{14}_/).first()).toBeVisible();
});

test("reaches system and jobs from the navbar", async ({ page }) => {
  await page.goto("/items");

  const nav = page.getByRole("navigation", { name: "Main" });
  await nav.getByRole("link", { name: "System", exact: true }).click();
  await expect(page).toHaveURL(/\/system$/);

  await nav.getByRole("link", { name: "Jobs", exact: true }).click();
  await expect(page).toHaveURL(/\/system\/jobs/);
});

test("shows every registered job with its frequency and next run", async ({
  page,
}) => {
  await page.goto("/system/jobs");

  // Scoped to the schedule table: the history below it carries the same job
  // names, so an unscoped row filter matches both once anything has run.
  const schedule = page.getByRole("table", { name: "Schedule" });

  await expect(schedule).toContainText("Result");
  // A badge rather than plain text, so colour carries the outcome too.
  await expect(
    schedule.getByText(/success|fail|Never|—/).first(),
  ).toBeVisible();

  const archive = schedule.getByRole("row").filter({ hasText: "Archive logs" });
  await expect(archive).toContainText("Every day");
  // Relative on screen, exact on hover — a schedule reads as "how long ago".
  await expect(archive).toContainText(/Never|Due now|Running now|ago|in /);
  // The result is its own column now, not appended to the last-run time.
  await expect(archive).not.toContainText(/ago — /);

  const backup = schedule.getByRole("row").filter({ hasText: "Backup" });
  await expect(backup).toContainText(/Every \d+ days/);
});

test("records a run in the history table and opens its logs", async ({
  page,
}) => {
  await page.goto("/system/jobs");

  // Deliberately the backup job rather than the archive one: archiving drains
  // the log table, including the records of its own run, so it is the one job
  // whose logs may legitimately be gone.
  await page
    .getByRole("button", { name: "Run Backup now", exact: true })
    .click();

  // Scoped to rows that carry a logs control: the schedule table's "Last run"
  // column also says "success", and its rows have no such button.
  const historyRow = page
    .getByRole("row")
    .filter({ has: page.getByRole("link", { name: /^Logs for run/ }) })
    .filter({ hasText: "success" })
    .first();
  await expect(historyRow).toBeVisible({ timeout: 20_000 });

  await historyRow.getByRole("link", { name: /^Logs for run/ }).click();

  // A modal rather than the side panel: log lines are wide and the panel is a
  // narrow fixed column. Still a route, so the run has its own URL.
  await expect(page).toHaveURL(/\/system\/jobs\/\d+/);
  const dialog = page.getByRole("dialog");
  await expect(
    dialog.getByText(/\[jobs\] runJob: (started|finished)/).first(),
  ).toBeVisible();

  await dialog.getByRole("button", { name: "Close the logs" }).click();
  await expect(page).toHaveURL(/\/system\/jobs\?/);
  await expect(page.getByRole("dialog")).toBeHidden();
});

test("keeps the history filters while a run's logs are open", async ({
  page,
}) => {
  await page.goto("/system/jobs?job=backup&size=10");

  // Make the run this needs rather than skipping when there is none: a fresh
  // container database has no history, and a test that quietly skips there is
  // not testing anything.
  const runNow = page.getByRole("button", {
    name: "Run Backup now",
    exact: true,
  });
  await runNow.click();

  // Wait for the run to finish before the test ends. A job's button is disabled
  // while it holds the lock, so a test that leaves one going leaves the next
  // one clicking a disabled button — which only surfaces under Docker, where
  // the subprocess is slower. Waiting for a "success" badge does not work: an
  // earlier run's badge satisfies it immediately.
  await expect(runNow).toBeEnabled({ timeout: 30_000 });

  const logs = page.getByRole("link", { name: /^Logs for run/ }).first();
  await expect(logs).toBeVisible();
  await logs.click();

  // Closing is a navigation, so the search has to be carried both ways.
  await expect(page).toHaveURL(/job=backup/);
  await page.getByRole("button", { name: "Close the logs" }).click();
  await expect(page).toHaveURL(/job=backup/);
  await expect(page).toHaveURL(/size=10/);
});

test("filters the history by job and by result", async ({ page }) => {
  await page.goto("/system/jobs");

  await page
    .getByRole("combobox", { name: "Filter by job", exact: true })
    .click();
  await page.getByRole("option", { name: "Backup", exact: true }).click();
  await expect(page).toHaveURL(/job=backup/);

  // The filters are search params, so they survive a reload the way the items
  // list's do.
  await page.reload();
  await expect(
    page.getByRole("combobox", { name: "Filter by job", exact: true }),
  ).toHaveValue("Backup");

  // Mantine sizes the radio itself to 0x0 and drives it from the label over
  // it, so the label is the only thing Playwright can click.
  const results = page.getByRole("radiogroup", { name: "Filter by result" });
  await results.getByText("fail", { exact: true }).click();
  await expect(page).toHaveURL(/status=failed/);
  await expect(page.getByText("No runs match these filters.")).toBeVisible();
});

test("falls back to defaults for a malformed search param", async ({
  page,
}) => {
  await page.goto("/system/jobs?size=99999&status=bogus&page=abc");

  // One catch around the whole schema, so a bad param resets all of them.
  await expect(
    page.getByRole("radio", { name: "All", exact: true }),
  ).toBeChecked();
  await expect(page.getByText(/Showing/)).toBeVisible();
});

test("still answers health while the system page exists", async () => {
  const response = await fetch(new URL("/health", E2E_BASE_URL));

  expect(response.status).toBe(200);
});

test("never truncates a result badge, however narrow the table gets", async ({
  page,
}) => {
  await page.goto("/system/jobs");
  const runNow = page.getByRole("button", {
    name: "Run Backup now",
    exact: true,
  });
  await runNow.click();

  const history = page.getByRole("table", { name: "Run history" });
  const badge = history.getByText("success", { exact: true }).first();
  await expect(badge).toBeVisible({ timeout: 20_000 });

  // Squeezed hard enough that something has to give — it must not be this.
  await page.setViewportSize({ width: 760, height: 900 });
  await expect(badge).toBeVisible();

  // Nothing in the accessibility tree can see an ellipsis: Mantine clips the
  // label in CSS while the text content stays whole. Measuring is the only way.
  const clipped = await badge.evaluate(
    (element) => element.scrollWidth > element.clientWidth,
  );
  expect(clipped).toBe(false);
  await expect(badge).toHaveText("success");

  // Leave the lock released for whatever runs next.
  await page.setViewportSize({ width: 1280, height: 900 });
  await expect(runNow).toBeEnabled({ timeout: 30_000 });
});

test("takes a backup, lists it, and serves it for download", async ({
  page,
  request,
}) => {
  await page.goto("/system/backups");

  const backUpNow = page.getByRole("button", { name: "Back up now" });
  await backUpNow.click();

  const row = page
    .getByRole("row")
    .filter({ hasText: /^backup-/ })
    .first();
  await expect(row).toBeVisible({ timeout: 15_000 });

  const link = row.getByRole("link");
  const href = await link.getAttribute("href");
  expect(href).toMatch(/^\/backups\/backup-.*\.zip$/);

  // A real link rather than a fetch-and-blob, so the response is checkable.
  const download = await request.get(href!);
  expect(download.status()).toBe(200);
  expect(download.headers()["content-type"]).toBe("application/zip");
  expect(download.headers()["content-disposition"]).toContain("attachment");
  expect((await download.body()).byteLength).toBeGreaterThan(0);

  await expect(backUpNow).toBeEnabled({ timeout: 30_000 });
});

test("serves no file for a name it did not write", async ({ request }) => {
  // Traversal is the risk the route actually carries, authentication aside.
  for (const name of [
    "..%2F..%2Fapp.db",
    "app.db",
    "backup-../../../etc/passwd",
  ]) {
    const response = await request.get(`/backups/${name}`, {
      maxRedirects: 0,
    });
    expect(response.status()).toBe(404);
  }
});

test("sends no CORS headers on a backup download", async () => {
  // The download is unauthenticated, so wildcard CORS would let any page the
  // operator visits read the whole database. It lives outside /api/ for this.
  const response = await fetch(new URL("/backups/nope.zip", E2E_BASE_URL));

  expect(response.headers.get("access-control-allow-origin")).toBeNull();
});

test("offers restore as a primary action in the header", async ({ page }) => {
  await page.goto("/system/backups");

  // Located by element, not by role: the content header is a <header> nested
  // inside <main>, so it is not a banner landmark.
  const restore = page.locator("header").getByRole("button", {
    name: "Restore",
    exact: true,
  });
  await expect(restore).toBeVisible();

  // Above the content it acts on, and still there after scrolling — the header
  // is sticky, which is what makes it a page-level action.
  const table = page.getByRole("table").first();
  const [action, content] = await Promise.all([
    restore.boundingBox(),
    table.boundingBox(),
  ]);
  expect(action!.y).toBeLessThan(content!.y);

  // Not the destructive treatment: red and outlined read as "delete", and the
  // previous database survives until the restored one answers a query.
  await expect(restore).not.toHaveClass(/outline/);
  await expect(
    page.getByText(/accepts only an archive taken by this version/),
  ).toBeVisible();
});

test("deletes a backup after confirming", async ({ page }) => {
  await page.goto("/system/backups");
  const backUpNow = page.getByRole("button", { name: "Back up now" });
  await backUpNow.click();

  const newest = page
    .getByRole("row")
    .filter({ hasText: /^backup-/ })
    .first();
  await expect(newest).toBeVisible({ timeout: 15_000 });
  const name = await newest.getByRole("link").innerText();

  // Pinned to the name that was read, not re-derived from .first(): the list
  // re-renders after the invalidate, and a locator is lazy, so "the first row"
  // can resolve to a different row than the one the name came from.
  const row = page.getByRole("row").filter({ hasText: name });

  await row
    .getByRole("button", { name: `Delete ${name}`, exact: true })
    .click();

  // Unlike a row deletion there is no undo, so this one asks first.
  const modal = page.getByRole("dialog");
  await expect(modal.getByText(name)).toBeVisible();
  await modal.getByRole("button", { name: "Keep it" }).click();
  await expect(page.getByRole("link", { name, exact: true })).toBeVisible();

  await row
    .getByRole("button", { name: `Delete ${name}`, exact: true })
    .click();
  await page.getByRole("button", { name: "Delete", exact: true }).click();

  await expect(page.getByRole("link", { name, exact: true })).toBeHidden();

  await expect(backUpNow).toBeEnabled({ timeout: 30_000 });
});

test("keeps a typed backup interval in the field it was typed into", async ({
  page,
}) => {
  await page.goto("/system/backups");

  const interval = page.getByRole("textbox", { name: "Interval", exact: true });
  const saved = page.waitForResponse(
    (response) =>
      response.url().includes("_serverFn") &&
      response.request().method() === "POST",
  );

  await interval.fill("14");
  // The field answers the keystroke, not the round trip behind it.
  await expect(interval).toHaveValue("14");

  // Typing is debounced, so a reload before the write lands would discard it —
  // a real browser asks first, which Playwright dismisses for us.
  await saved;
  await page.reload();
  await expect(interval).toHaveValue("14");

  const restored = page.waitForResponse(
    (response) =>
      response.url().includes("_serverFn") &&
      response.request().method() === "POST",
  );
  await interval.fill("7");
  await restored;
});
