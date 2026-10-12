import { expect, seedItems, test, totalItems } from "@/app/testing/e2e";

const ids = (body: { items: { id: string }[] }) =>
  body.items.map((item) => item.id);

test("health returns ok", async ({ request }) => {
  const response = await request.get("/health");

  expect(response.status()).toBe(200);
  expect(await response.json()).toEqual({ ok: true });
});

test("lists seeded items newest first", async ({ request }) => {
  const before = await totalItems(request);

  await seedItems(request, ["alpha", "beta"]);

  const response = await request.get("/api/v1/items");
  const body = await response.json();

  expect(response.status()).toBe(200);
  expect(body.total).toBe(before + 2);
  expect(
    body.items.slice(0, 2).map((item: { name: string }) => item.name),
  ).toEqual(["beta", "alpha"]);
});

test("creates an item", async ({ request }) => {
  const response = await request.post("/api/v1/items", {
    data: { name: "Created over HTTP" },
  });

  expect(response.status()).toBe(201);
  expect((await response.json()).name).toBe("Created over HTTP");
});

test("updates an item", async ({ request }) => {
  const created = await request.post("/api/v1/items", {
    data: { name: "Before" },
  });
  const { id } = await created.json();

  const response = await request.put(`/api/v1/items/${id}`, {
    data: { name: "After" },
  });

  expect(response.status()).toBe(200);
  expect((await response.json()).name).toBe("After");
});

test("deletes an item and reports 204", async ({ request }) => {
  const created = await request.post("/api/v1/items", {
    data: { name: "Doomed" },
  });
  const { id } = await created.json();

  const response = await request.delete(`/api/v1/items/${id}`);

  expect(response.status()).toBe(204);
  expect((await request.get(`/api/v1/items/${id}`)).status()).toBe(404);
});

test("serializes timestamps as ISO strings", async ({ request }) => {
  const response = await request.post("/api/v1/items", {
    data: { name: "Serialized" },
  });
  const { createdAt, updatedAt } = await response.json();

  expect(typeof createdAt).toBe("string");
  expect(new Date(createdAt).toISOString()).toBe(createdAt);
  expect(typeof updatedAt).toBe("string");
});

test("returns a request id and honours an inbound one", async ({ request }) => {
  const generated = await request.get("/api/v1/items");

  expect(generated.headers()["x-request-id"]).toBeTruthy();

  const supplied = await request.get("/api/v1/items", {
    headers: { "X-Request-Id": "e2e-trace-1" },
  });

  expect(supplied.headers()["x-request-id"]).toBe("e2e-trace-1");
});

test("rejects an invalid body with 400", async ({ request }) => {
  const response = await request.post("/api/v1/items", { data: { name: "" } });

  expect(response.status()).toBe(400);
  expect((await response.json()).error.code).toBe("validation_failed");
});

test("returns 404 for a missing item", async ({ request }) => {
  const response = await request.get("/api/v1/items/does-not-exist");

  expect(response.status()).toBe(404);

  const body = await response.json();

  expect(body.error.code).toBe("not_found");
  expect(body.error.message).toBe("Not found.");
});

test("paginates with string query params", async ({ request }) => {
  await seedItems(
    request,
    Array.from({ length: 12 }, (_, index) => `api page ${index}`),
  );

  const first = await (await request.get("/api/v1/items")).json();
  const response = await request.get("/api/v1/items?page=2");
  const body = await response.json();

  expect(response.status()).toBe(200);
  expect(body.total).toBe(first.total);
  expect(body.items[0].id).not.toBe(first.items[0].id);
});

test("filters the list by status", async ({ request }) => {
  const open = await request.post("/api/v1/items", {
    data: { name: "api status open" },
  });
  const done = await request.post("/api/v1/items", {
    data: { name: "api status done" },
  });
  const { id: doneId } = await done.json();
  const { id: openId } = await open.json();

  expect(
    (
      await request.put(`/api/v1/items/${doneId}`, {
        data: { completed: true },
      })
    ).status(),
  ).toBe(200);

  const incomplete = await (
    await request.get("/api/v1/items?status=incomplete")
  ).json();
  const complete = await (
    await request.get("/api/v1/items?status=complete")
  ).json();

  expect(ids(incomplete)).toContain(openId);
  expect(ids(incomplete)).not.toContain(doneId);
  expect(ids(complete)).toContain(doneId);
});

test("rejects an unknown status with 400", async ({ request }) => {
  const response = await request.get("/api/v1/items?status=pending");

  expect(response.status()).toBe(400);
  expect((await response.json()).error.code).toBe("validation_failed");
});

test("accepts a partial update carrying only completed", async ({
  request,
}) => {
  const created = await request.post("/api/v1/items", {
    data: { name: "api partial" },
  });
  const { id } = await created.json();

  const response = await request.put(`/api/v1/items/${id}`, {
    data: { completed: true },
  });
  const body = await response.json();

  expect(response.status()).toBe(200);
  expect(body.name).toBe("api partial");
  expect(body.completed).toBe(true);
  expect(typeof body.completedAt).toBe("string");
});

test("rejects an empty update body with 400", async ({ request }) => {
  const created = await request.post("/api/v1/items", {
    data: { name: "api empty update" },
  });
  const { id } = await created.json();

  const response = await request.put(`/api/v1/items/${id}`, { data: {} });

  expect(response.status()).toBe(400);
  expect((await response.json()).error.code).toBe("validation_failed");
});

test("rejects a page size outside the allowed set with 400", async ({
  request,
}) => {
  const response = await request.get("/api/v1/items?size=1000000");

  expect(response.status()).toBe(400);
  expect((await response.json()).error.code).toBe("validation_failed");
});
