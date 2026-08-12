import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

import {
  index,
  physical,
  rootRoute,
  route,
} from "@tanstack/virtual-file-routes";

const FEATURES_DIR = join(import.meta.dirname, "features");
const API_VERSION = /^v[1-9]\d*$/;

const directoriesIn = (dir: string) =>
  readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);

const mountsFor = (name: string) => {
  const featureDir = join(FEATURES_DIR, name);
  const pagesDir = join(featureDir, "routes", "pages");
  const apiDir = join(featureDir, "routes", "api");

  const pages = existsSync(pagesDir)
    ? [physical(`/${name}`, `../features/${name}/routes/pages`)]
    : [];

  if (!existsSync(apiDir)) {
    return pages;
  }

  const versions = directoriesIn(apiDir);
  if (versions.length === 0) {
    throw new Error(
      `${name}: routes/api holds no version directory. Handlers belong in routes/api/v1, not routes/api.`,
    );
  }

  const invalid = versions.filter((version) => !API_VERSION.test(version));
  if (invalid.length > 0) {
    throw new Error(
      `${name}: routes/api/${invalid.join(", ")} is not an API version. Expected v1, v2, and so on.`,
    );
  }

  return [
    ...pages,
    ...versions.map((version) =>
      physical(
        `/api/${version}/${name}`,
        `../features/${name}/routes/api/${version}`,
      ),
    ),
  ];
};

const featureMounts = directoriesIn(FEATURES_DIR).flatMap(mountsFor);

export const virtualRouteConfig = rootRoute("__root.tsx", [
  index("index.tsx"),
  route("/health", "health.ts"),
  route("/backups/$name", "backups/$name.ts"),
  route("/settings", "settings/route.tsx", [
    index("settings/index.tsx"),
    route("/general", "settings/general.tsx"),
    route("/ui", "settings/ui.tsx"),
  ]),
  route("/system", "system/route.tsx", [
    index("system/index.tsx"),
    route("/backups", "system/backups.tsx"),
    route("/jobs", "system/jobs/route.tsx", [
      route("/$runId", "system/jobs/$runId.tsx"),
    ]),
  ]),
  ...featureMounts,
]);
