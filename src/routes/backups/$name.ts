import { createReadStream, statSync } from "node:fs";

import { createFileRoute } from "@tanstack/react-router";

import { resolveBackupPath } from "@/app/server/jobs/backup";

const notFound = () => new Response("Not found", { status: 404 });

// Behind the session gate, and outside /api/ so no CORS header is sent.
export const Route = createFileRoute("/backups/$name")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const { name } = params;
        // Anything that is not a file this application wrote is a 404.
        const path = await resolveBackupPath(name);
        if (path === null) {
          return notFound();
        }

        // Streamed, so an archive larger than memory is still downloadable.
        // Built by hand rather than through Readable.toWeb, whose node:stream/web
        // return type is not assignable to BodyInit and would need a cast.
        const file = createReadStream(path);
        const stream = new ReadableStream({
          start: (controller) => {
            file.on("data", (chunk: Buffer | string) => {
              controller.enqueue(new Uint8Array(Buffer.from(chunk)));
              // Backpressure: without this a large archive is read into memory
              // as fast as the disk allows, whatever the client consumes.
              if ((controller.desiredSize ?? 0) <= 0) {
                file.pause();
              }
            });
            file.on("end", () => controller.close());
            file.on("error", (error) => controller.error(error));
          },
          pull: () => {
            file.resume();
          },
          cancel: () => {
            file.destroy();
          },
        });
        return new Response(stream, {
          headers: {
            "Content-Type": "application/zip",
            "Content-Length": String(statSync(path).size),
            "Content-Disposition": `attachment; filename="${name}"`,
          },
        });
      },
    },
  },
});
