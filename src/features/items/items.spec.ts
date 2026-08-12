import type { Locator } from "@playwright/test";

import { expect, seedItems, test, totalItems } from "@/app/testing/e2e";

test("redirects the index to the items list", async ({ page }) => {
  await page.goto("/");

  await expect(page).toHaveURL(/\/items(\?.*)?$/);
  await expect(page.getByRole("heading", { name: "Items" })).toBeVisible();
});

test("checks an item off in the list", async ({ page, request }) => {
  await seedItems(request, ["toggle me"]);

  await page.goto("/items");

  const row = page.getByRole("row", { name: /toggle me/ });
  const checkbox = row.getByRole("checkbox");

  await expect(checkbox).not.toBeChecked();
  // click, not check(): the box is controlled by loader data, so React restores
  // it to unchecked before Playwright's check() can verify the click landed.
  await checkbox.click();

  await expect(checkbox).toBeChecked();

  await page.reload();

  await expect(
    page.getByRole("row", { name: /toggle me/ }).getByRole("checkbox"),
  ).toBeChecked();
});

test("filters completed items out of the incomplete view", async ({
  page,
  request,
}) => {
  await seedItems(request, ["filter open", "filter done"]);

  await page.goto("/items");
  const done = page
    .getByRole("row", { name: /filter done/ })
    .getByRole("checkbox");
  await done.click();
  await expect(done).toBeChecked();

  await page.goto("/items?status=incomplete");

  // exact: true — every cell in a row carries the item name in an aria-label.
  await expect(
    page.getByRole("cell", { name: "filter open", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("cell", { name: "filter done", exact: true }),
  ).toBeHidden();
  // The header is fixed now that the toolbar shows which filter is active.
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Items");
});

test("shows all three timestamps in the popover", async ({ page, request }) => {
  await seedItems(request, ["timestamped"]);

  await page.goto("/items");
  await page
    .getByRole("row", { name: /timestamped/ })
    .getByRole("button", { name: /Show timestamps/ })
    .click();

  // Mantine labels the dropdown from its trigger via aria-labelledby, which
  // outranks any aria-label, so the name here would be the trigger's, not ours.
  const popover = page.getByRole("dialog");

  await expect(popover.getByText("Created")).toBeVisible();
  await expect(popover.getByText("Updated")).toBeVisible();
  await expect(popover.getByText("Completed")).toBeVisible();
});

test("renames an item inline and the change survives a reload", async ({
  page,
  request,
}) => {
  await seedItems(request, ["inline original"]);

  await page.goto("/items");
  await page
    .getByRole("row", { name: /inline original/ })
    .getByRole("button", { name: "Edit inline original" })
    .click();

  const input = page.getByRole("textbox", { name: "Name" });

  await input.fill("inline renamed");
  await page.getByRole("button", { name: "Save name" }).click();

  await expect(
    page.getByRole("cell", { name: "inline renamed", exact: true }),
  ).toBeVisible();

  await page.reload();

  await expect(
    page.getByRole("cell", { name: "inline renamed", exact: true }),
  ).toBeVisible();
});

// The table is `table-layout: auto`, where a column is as wide as its widest
// cell asks to be — so a nowrap name would push the table out of the content
// column rather than truncate. `max-width: 0` on the name cells is what takes
// them out of that calculation and gives the text inside a definite width.
test("truncates a long name instead of stretching the table", async ({
  page,
  request,
}) => {
  // The schema caps a name at 100 characters, and 99 of them is well past the
  // width the name column is left with at the default content measure.
  const name = `truncated ${"wide ".repeat(17)}name`;

  await seedItems(request, [name]);

  await page.goto("/items");

  const label = page
    .getByRole("cell", { name, exact: true })
    .getByText(name, { exact: true });

  await expect(label).toBeVisible();

  const clipping = await label.evaluate((node) => ({
    overflow: getComputedStyle(node).textOverflow,
    clipped: node.scrollWidth > node.clientWidth,
  }));

  expect(clipping.overflow).toBe("ellipsis");
  expect(clipping.clipped).toBe(true);

  // And nothing pushed the page sideways. A table that grew instead of
  // truncating overflows its own container, which the document reports rather
  // than the table element: `width: 100%` is a floor for a table, not a cap.
  const overflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  );

  expect(overflow).toBeLessThanOrEqual(1);
});

test("adds an item through the blank row", async ({ page }) => {
  await page.goto("/items");
  await page.getByRole("main").getByRole("link", { name: "Add item" }).click();

  await expect(page).toHaveURL(/\/items\/new/);

  await page.getByRole("textbox", { name: "Name" }).fill("added inline");
  await page.getByRole("button", { name: "Create item" }).click();

  await expect(page).toHaveURL(/\/items(\?.*)?$/);
  await expect(
    page.getByRole("cell", { name: "added inline", exact: true }),
  ).toBeVisible();
});

// Escape is two steps here and one in the rename row: what is typed into the
// blank row has no other copy, where an abandoned rename leaves the original
// name on screen.
test("escape clears the new-item field, then cancels the creation", async ({
  page,
}) => {
  await page.goto("/items");
  await page.getByRole("main").getByRole("link", { name: "Add item" }).click();

  await expect(page).toHaveURL(/\/items\/new/);

  const input = page.getByRole("textbox", { name: "Name" });

  await input.fill("escape draft");
  await input.press("Escape");

  await expect(input).toHaveValue("");
  await expect(page).toHaveURL(/\/items\/new/);

  await input.press("Escape");

  await expect(page).toHaveURL(/\/items(\?.*)?$/);
  await expect(page.getByRole("textbox", { name: "Name" })).toHaveCount(0);
});

// The user's report: a name past the cap failed with generic advice and no
// reason. The sentence comes from the schema, through the server function
// boundary, to the toast.
test("names the reason a create was rejected", async ({ page }) => {
  await page.goto("/items");
  await page.getByRole("main").getByRole("link", { name: "Add item" }).click();

  await page.getByRole("textbox", { name: "Name" }).fill("x".repeat(101));
  await page.getByRole("button", { name: "Create item" }).click();

  await expect(
    page.getByText(
      "Could not create the item. Name must be 100 characters or fewer.",
    ),
  ).toBeVisible();
  // Nothing was created, so the blank row is still where it was.
  await expect(page).toHaveURL(/\/items\/new/);
});

// Delete raises the offer, the offer restores the item, and the round trip
// carries `completed` across — undo is a re-add, so nothing survives that is
// not passed back.
test("undoes a delete from the toast", async ({ page, request }) => {
  await seedItems(request, ["undo me"]);

  await page.goto("/items");

  const cell = page.getByRole("cell", { name: "undo me", exact: true });
  // exact: true — the row's own buttons are named "… undo me", which a
  // substring match resolves to as well.
  const restore = page.getByRole("button", { name: "Restore", exact: true });
  const row = () => page.getByRole("row", { name: /undo me/ });
  const deleteRow = () =>
    row().getByRole("button", { name: "Delete undo me" }).click();

  // Completed first, so the undo has something to carry across.
  await row().getByRole("checkbox").click();
  await expect(row().getByRole("checkbox")).toBeChecked();

  await deleteRow();

  await expect(cell).toBeHidden();
  // The toast closes on a timer, so the click follows the delete assertion
  // directly. Anything that waits in between is a race, not a slow toast.
  await restore.click();

  await expect(cell).toBeVisible();
  // Undo re-adds rather than restores — new id, fresh createdAt, restamped
  // completedAt — so `completed` only survives because it is passed back.
  await expect(row().getByRole("checkbox")).toBeChecked();
  // Undo hides its own toast, so a later one is unambiguously the next
  // delete's rather than this one lingering.
  await expect(restore).toBeHidden();

  // Leaves the table as it found it. Every delete-family case ends with its
  // rows gone, and a survivor turns --repeat-each — the tool a case with a
  // timed toast in it invites — into a strict-mode violation instead of a
  // timing failure.
  await deleteRow();

  await expect(cell).toBeHidden();
});

// A name runs to the schema's 100-character cap, and the toast is 440px wide.
// The message is the half that gives way; Mantine's Button clips its own label,
// so a button that shrank would read "Res" and still pass every assertion about
// its accessible name.
test("keeps the undo control whole beside a long name", async ({
  page,
  request,
}) => {
  const name = "a".repeat(100);
  await seedItems(request, [name]);

  await page.goto("/items");

  const cell = page.getByRole("cell", { name, exact: true });
  const deleteRow = () =>
    page
      .getByRole("row", { name: new RegExp(name) })
      .getByRole("button", { name: `Delete ${name}` })
      .click();

  await deleteRow();

  await expect(cell).toBeHidden();

  const restore = page.getByRole("button", { name: "Restore", exact: true });
  await expect(restore).toBeVisible();

  // The label is where the clipping lands, and Mantine's own class is the only
  // handle on it — the same trade the countdown case makes, and a rename fails
  // this rather than passing quietly.
  const label = restore.locator(".mantine-Button-label");
  expect(await label.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(
    true,
  );

  // Nothing overflows the toast either: an unbroken name has to wrap.
  const toast = page.locator(".mantine-Notification-root");
  expect(await toast.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(
    true,
  );
});

// The failure branch, induced by holding the create request open and then
// failing it. Nothing else in the suite can make a mutation fail, and this is
// the one path where a toast that hid itself first would leave the item
// unrecoverable while telling the user to try again.
test("keeps the undo offer alive when the restore fails", async ({
  page,
  request,
}) => {
  await seedItems(request, ["undo failure"]);

  const held = Promise.withResolvers<void>();
  let failCreate = false;

  await page.route("**/_serverFn/**", async (route) => {
    if (failCreate && route.request().method() === "POST") {
      await held.promise;
      await route.abort("failed");
      return;
    }
    await route.continue();
  });

  await page.goto("/items");

  const cell = page.getByRole("cell", { name: "undo failure", exact: true });
  const restore = page.getByRole("button", { name: "Restore", exact: true });
  const deleteRow = () =>
    page
      .getByRole("row", { name: /undo failure/ })
      .getByRole("button", { name: "Delete undo failure" })
      .click();

  // The bar rides inside the toast's message, so it is present exactly while
  // the offer is on a timer.
  const countdown = page.locator("[data-countdown]");

  await deleteRow();

  await expect(cell).toBeHidden();
  await expect(countdown).toBeVisible();

  failCreate = true;
  await restore.click();

  // The request is held open, so the in-flight state is observed rather than
  // raced for. No Restore button means a second click cannot create a second
  // item.
  await expect(page.getByText(/^Restoring/)).toBeVisible();
  await expect(restore).toBeHidden();

  held.resolve();

  // The failure replaces the same toast rather than hiding it, so the message
  // telling the user to try again sits beside a control that still can.
  await expect(
    page.getByText("Could not restore the item. Please try again."),
  ).toBeVisible();
  await expect(restore).toBeVisible();
  // An update replaces the message outright, and the countdown was part of it:
  // this toast never closes itself, so nothing may show time running out.
  await expect(countdown).toBeHidden();

  failCreate = false;
  await restore.click();

  await expect(cell).toBeVisible();

  await deleteRow();

  await expect(cell).toBeHidden();
});

// The undo toast reports its own outcome from module scope, outside any hook,
// so it composes the sentence itself — and composing it by hand is how a
// reportable reason gets replaced by generic advice. Restoring cannot fail
// validation on its own, since the name it re-sends already passed, so the
// request is rewritten in flight to make the server reject it for a reason it
// wrote for a person.
test("names the reason a restore was rejected", async ({ page, request }) => {
  const name = "reason me";
  await seedItems(request, [name]);

  let corrupt = false;
  await page.route("**/_serverFn/**", async (route) => {
    const body = route.request().postData();
    if (corrupt && body !== null && body.includes(name)) {
      await route.continue({ postData: body.replace(name, "q".repeat(101)) });
      return;
    }
    await route.continue();
  });

  await page.goto("/items");

  const cell = page.getByRole("cell", { name, exact: true });
  const restore = page.getByRole("button", { name: "Restore", exact: true });

  await page
    .getByRole("row", { name: new RegExp(name) })
    .getByRole("button", { name: `Delete ${name}` })
    .click();

  await expect(cell).toBeHidden();

  corrupt = true;
  await restore.click();

  await expect(
    page.getByText(
      "Could not restore the item. Name must be 100 characters or fewer.",
    ),
  ).toBeVisible();
  // The offer survives its own failure, and the row stayed deleted.
  await expect(restore).toBeVisible();
  await expect(cell).toBeHidden();
});

// A failed mutation is a toast now rather than text under the item name: a
// table row has nowhere to put a sentence, and the row a delete failed on is
// already gone by the time its message would arrive.
test("reports a failed update as a toast that counts down", async ({
  page,
  request,
}) => {
  await seedItems(request, ["toast failure"]);

  let failUpdate = false;

  await page.route("**/_serverFn/**", async (route) => {
    if (failUpdate && route.request().method() === "POST") {
      await route.abort("failed");
      return;
    }
    await route.continue();
  });

  await page.goto("/items");

  const row = page.getByRole("row", { name: /toast failure/ });
  const message = page.getByText(
    "Could not update the item. Please try again.",
  );
  const countdown = page.locator("[data-countdown]");
  const bar = countdown.locator("div");
  const animation = () =>
    bar.evaluate((node) => getComputedStyle(node).animationName);

  failUpdate = true;
  await row.getByRole("checkbox").click();

  await expect(message).toBeVisible();
  // The row itself says nothing — the message left the table with the toast.
  await expect(row.getByText(/^Could not/)).toBeHidden();
  await expect(countdown).toBeVisible();
  expect(await animation()).not.toBe("none");

  // Marked so the repeat below can tell a fresh bar from the same one still
  // draining. Only a fresh mount restarts the CSS countdown and Mantine's
  // auto-close timer, which is why the toast is hidden and reshown under a new
  // id rather than updated in place.
  await countdown.evaluate((node) => node.setAttribute("data-first", "true"));

  await row.getByRole("checkbox").click();

  // The same failure again is one piece of news, not two: the toast is
  // replaced rather than a second copy of the sentence stacked beside it.
  await expect(page.locator("[data-countdown][data-first]")).toHaveCount(0);
  await expect(message).toHaveCount(1);

  // Mantine cancels the auto-close timer while a toast is hovered and starts a
  // fresh full-length one on leave, so the bar has to stop with it rather than
  // drain toward a deadline that has moved.
  await message.hover();

  expect(await animation()).toBe("none");
});

test("pages and changes the page size", async ({ page, request }) => {
  // The e2e database accumulates, so every figure here is relative to what
  // was already there.
  const before = await totalItems(request, { status: "incomplete" });

  await seedItems(
    request,
    Array.from({ length: 12 }, (_, index) => `paged item ${index}`),
  );

  const total = before + 12;

  // Started on a filter so the footer has a search param to lose: a literal
  // search object in place of the updater would drop it and still page.
  await page.goto("/items?status=incomplete");

  await expect(page.getByText(`Showing 1–10 of ${total}`)).toBeVisible();
  await expect(
    page.getByRole("cell", { name: /^paged item \d+$/ }),
  ).toHaveCount(10);

  // Mantine's edge controls are icon-only; without getControlProps they have
  // no accessible name at all.
  const pager = page.getByRole("navigation", { name: "Pagination" });

  await expect(pager.getByRole("button", { name: "Next page" })).toBeVisible();

  await pager.getByRole("button", { name: "2", exact: true }).click();

  await expect(page).toHaveURL(/page=2/);
  await expect(page).toHaveURL(/status=incomplete/);
  await expect(
    page.getByText(`Showing 11–${Math.min(20, total)} of ${total}`),
  ).toBeVisible();

  // getByLabel would match the listbox too: Mantine points both the input
  // and its dropdown at the same label element.
  await page.getByRole("combobox", { name: "per page" }).click();
  await page.getByRole("option", { name: "25", exact: true }).click();

  await expect(page).toHaveURL(/size=25/);
  await expect(page).toHaveURL(/page=1/);
  await expect(page).toHaveURL(/status=incomplete/);
  await expect(
    page.getByText(`Showing 1–${Math.min(25, total)} of ${total}`),
  ).toBeVisible();
});

// The toolbar owns the filter now, and the one control has to merge the rest
// of the search forward rather than replace it. Adding from the complete
// filter is folded in here: it is the same toolbar, one navigation later.
test("filters from the toolbar and adds from the complete filter", async ({
  page,
  request,
}) => {
  await seedItems(request, ["toolbar open", "toolbar done"]);

  await page.goto("/items?size=25");

  const main = page.getByRole("main");
  const filter = main.getByRole("radiogroup", { name: "Filter by status" });
  const done = main
    .getByRole("row", { name: /toolbar done/ })
    .getByRole("checkbox");

  await done.click();
  await expect(done).toBeChecked();

  // Mantine sizes the radio itself to 0x0 and drives it from the label over
  // it, so the label is the only thing Playwright can click.
  await filter.getByText("Complete", { exact: true }).click();

  await expect(page).toHaveURL(/status=complete/);
  // Merged forward, not replaced: a literal search object would drop the size,
  // and the offset means nothing under a different filter.
  await expect(page).toHaveURL(/size=25/);
  await expect(page).toHaveURL(/page=1/);
  await expect(
    main.getByRole("cell", { name: "toolbar done", exact: true }),
  ).toBeVisible();
  await expect(
    main.getByRole("cell", { name: "toolbar open", exact: true }),
  ).toBeHidden();

  await main.getByRole("link", { name: "Add item" }).click();

  // A new item is always incomplete, so the complete filter would hide the row
  // being created. The route redirects rather than each control deciding.
  await expect(page).toHaveURL(/\/items\/new/);
  await expect(page).toHaveURL(/status=incomplete/);
  await expect(page).toHaveURL(/size=25/);
  await expect(
    filter.getByRole("radio", { name: "Incomplete", exact: true }),
  ).toBeChecked();
});

test("shows the not-found page for an unmatched route", async ({ page }) => {
  await page.goto("/no-such-page");

  await expect(page.getByRole("heading", { name: "Not found" })).toBeVisible();
});

// The nav registry discovers nav.ts by glob, which cannot be typechecked. This
// is what fails if that pattern stops matching.
test("contributes its link to the navbar", async ({ page }) => {
  await page.goto("/");

  await expect(
    page.getByRole("navigation", { name: "Main" }).getByRole("link", {
      name: "Items",
      exact: true,
    }),
  ).toBeVisible();
});

const TRANSPARENT = "rgba(0, 0, 0, 0)";

const fill = (link: Locator) =>
  link.evaluate((node) => getComputedStyle(node).backgroundColor);

const bar = (link: Locator) =>
  link.evaluate((node) => getComputedStyle(node).borderLeftColor);

test("renders its sub-nav and marks the active filter", async ({ page }) => {
  await page.goto("/items");

  const nav = page.getByRole("navigation", { name: "Main" });

  await expect(nav.getByRole("link", { name: "Incomplete" })).toBeVisible();
  await expect(
    nav.getByRole("link", { name: "Complete", exact: true }),
  ).toBeVisible();

  await nav.getByRole("link", { name: "Complete", exact: true }).click();

  await expect(page).toHaveURL(/status=complete/);

  // The click leaves the pointer on the link, and an active sub-item keeps a
  // hover background — which is exactly what the fill assertion below reads.
  await page.mouse.move(0, 0);

  const section = nav.getByRole("link", { name: "Items", exact: true });
  const filter = nav.getByRole("link", { name: "Complete", exact: true });

  // The section and the item within it are both active, so the attribute
  // alone no longer tells them apart — the two treatments are what does.
  await expect(section).toHaveAttribute("data-active", "true");
  await expect(filter).toHaveAttribute("data-active", "true");

  expect(await fill(section)).not.toBe(TRANSPARENT);
  expect(await fill(filter)).toBe(TRANSPARENT);
  expect(await bar(filter)).not.toBe(TRANSPARENT);
});

test("carries the page size across the sub-nav", async ({ page }) => {
  await page.goto("/items?size=50");

  const nav = page.getByRole("navigation", { name: "Main" });

  await nav.getByRole("link", { name: "Incomplete" }).click();

  await expect(page).toHaveURL(/size=50/);
  await expect(page).toHaveURL(/status=incomplete/);

  await page.goto("/items?status=incomplete&size=50");
  await nav.getByRole("link", { name: "Items", exact: true }).click();

  await expect(page).toHaveURL(/size=50/);
  await expect(page).toHaveURL(/status=all/);
});
