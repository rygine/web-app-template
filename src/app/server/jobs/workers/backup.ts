import { createReadStream, createWriteStream } from "node:fs";
import { rm } from "node:fs/promises";
import { backup, DatabaseSync } from "node:sqlite";
import { pipeline } from "node:stream/promises";
import { createZipArchive, ZipEntry } from "node:zlib";

type Payload = {
  databasePath: string;
  stagingPath: string;
  outPath: string;
  manifest: unknown;
};

const asPayload = (value: unknown): Payload => {
  if (value === null || typeof value !== "object") {
    throw new Error("payload must be an object");
  }
  if (!("databasePath" in value) || typeof value.databasePath !== "string") {
    throw new Error("payload.databasePath must be a string");
  }
  if (!("stagingPath" in value) || typeof value.stagingPath !== "string") {
    throw new Error("payload.stagingPath must be a string");
  }
  if (!("outPath" in value) || typeof value.outPath !== "string") {
    throw new Error("payload.outPath must be a string");
  }
  return {
    databasePath: value.databasePath,
    stagingPath: value.stagingPath,
    outPath: value.outPath,
    manifest: "manifest" in value ? value.manifest : {},
  };
};

// The archive is a Readable, so the database entry streams from disk to disk
// and is never held whole in memory.
const writeArchive = async (
  outPath: string,
  dbPath: string,
  manifest: string,
) =>
  pipeline(
    await createZipArchive([
      await ZipEntry.create("manifest.json", Buffer.from(manifest, "utf8")),
      ZipEntry.createStream("app.db", createReadStream(dbPath)),
    ]),
    createWriteStream(outPath),
  );

void (async () => {
  const payload = asPayload(JSON.parse(process.argv[2] ?? "null"));
  const source = new DatabaseSync(payload.databasePath, { readOnly: true });
  try {
    await backup(source, payload.stagingPath, {
      rate: 64,
      progress: ({ totalPages, remainingPages }) => {
        process.send?.({ totalPages, remainingPages });
      },
    });
  } finally {
    source.close();
  }

  await writeArchive(
    payload.outPath,
    payload.stagingPath,
    JSON.stringify(payload.manifest, null, 2),
  );
  await rm(payload.stagingPath, { force: true });
  process.exit(0);
})().catch((error: unknown) => {
  process.stderr.write(
    `${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exit(1);
});
