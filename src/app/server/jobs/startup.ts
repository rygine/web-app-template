import type { NitroAppPlugin } from "nitro/types";

import { ensureJobsRegistered, startEngines } from "@/app/server/jobs/jobs";
import { reclaimStaleRuns } from "@/app/server/jobs/runner";
import { startScheduler } from "@/app/server/jobs/scheduler";
import { loadLogLevel } from "@/app/server/log/logger";
import { resetAuth } from "@/app/server/services/auth";
import { envValue } from "@/app/server/utils/env";

// Off when CI or TEST holds a value, and an empty value counts as unset.
export const schedulerEnabled = () =>
  envValue("CI") === undefined && envValue("TEST") === undefined;

export const resetAuthIfAsked = async () => {
  if (envValue("RESET_AUTH") !== "1") {
    return;
  }
  try {
    await resetAuth();
  } catch (error) {
    console.error("auth: RESET_AUTH failed", error);
    return;
  }
  console.warn(
    "auth: RESET_AUTH=1 removed the account and every session. Remove RESET_AUTH now, or the account resets at every restart and the first visitor to /setup owns this instance.",
  );
};

export default async (nitroApp: Parameters<NitroAppPlugin>[0]) => {
  // Runs before the test guard, in every build.
  await resetAuthIfAsked();

  try {
    await loadLogLevel();
    ensureJobsRegistered();
  } catch (error) {
    console.error("jobs: registration failed", error);
    return;
  }

  const stops = startEngines();
  nitroApp.hooks.hook("close", () => {
    for (const stop of stops) {
      stop();
    }
  });

  if (!schedulerEnabled()) {
    return;
  }

  try {
    await reclaimStaleRuns();
    await startScheduler();
  } catch (error) {
    console.error("jobs: scheduler failed to start", error);
  }
};
