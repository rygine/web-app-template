import { createWriteStream } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { pipeline } from "node:stream/promises";
import { ZipFile } from "node:zlib";

type Payload = { archivePath: string; stagingPath: string };

const asPayload = (value: unknown): Payload => {
  if (value === null || typeof value !== "object") {
    throw new Error("payload must be an object");
  }
  if (!("archivePath" in value) || typeof value.archivePath !== "string") {
    throw new Error("payload.archivePath must be a string");
  }
  if (!("stagingPath" in value) || typeof value.stagingPath !== "string") {
    throw new Error("payload.stagingPath must be a string");
  }
  return { archivePath: value.archivePath, stagingPath: value.stagingPath };
};

// The database entry streams out to the staging file rather than being read
// whole; only the manifest is small enough to buffer.
const extract = async (
  payload: Payload,
): Promise<{ manifest: string | null }> => {
  const archive = await ZipFile.open(payload.archivePath);
  try {
    if (!(await archive.has("app.db"))) {
      throw new Error("the archive does not contain app.db");
    }
    await pipeline(
      (await archive.get("app.db")).contentIterator(),
      createWriteStream(payload.stagingPath),
    );
    const manifest = (await archive.has("manifest.json"))
      ? (await (await archive.get("manifest.json")).content()).toString("utf8")
      : null;
    return { manifest };
  } finally {
    await archive.close();
  }
};

void (async () => {
  const payload = asPayload(JSON.parse(process.argv[2] ?? "null"));
  const { manifest } = await extract(payload);

  const db = new DatabaseSync(payload.stagingPath, { readOnly: true });
  let migration: string | null = null;
  try {
    const row = db
      .prepare(
        "SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL ORDER BY finished_at DESC LIMIT 1",
      )
      .get();
    migration =
      row !== undefined && typeof row.migration_name === "string"
        ? row.migration_name
        : null;
  } finally {
    db.close();
  }

  await new Promise<void>((resolve) => {
    process.send?.({ manifest, migration }, () => resolve());
  });
  process.exit(0);
})().catch((error: unknown) => {
  process.stderr.write(
    `${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exit(1);
});
