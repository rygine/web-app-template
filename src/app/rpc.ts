import { createServerFn } from "@tanstack/react-start";
import { getCookie } from "@tanstack/react-start/server";

import { deleteBackup, listBackups } from "@/app/server/jobs/backup";
import { listJobRuns, runCorrelationId } from "@/app/server/jobs/history";
import { BACKUP_JOB, ensureJobsRegistered } from "@/app/server/jobs/jobs";
import { getJob, listJobs } from "@/app/server/jobs/registry";
import { restoreFromUpload as restoreUpload } from "@/app/server/jobs/restore";
import { describeJob, runJob } from "@/app/server/jobs/runner";
import type { JobOutcome } from "@/app/server/jobs/runner";
import { queryLogs } from "@/app/server/log/query";
import {
  getApiKey,
  isEnvManaged,
  regenerateApiKey,
} from "@/app/server/services/apiKey";
import {
  getSettings as readSettings,
  updateSettings as writeSettings,
} from "@/app/server/services/settings";
import { getRuntimeInfo } from "@/app/server/utils/runtime";
import { getSystemInfo } from "@/app/server/utils/system";
import type { ApiKeyView } from "@/app/shared/schemas/apiKey";
import { backupNameSchema } from "@/app/shared/schemas/backups";
import type { BackupsView } from "@/app/shared/schemas/backups";
import {
  jobNameSchema,
  jobRunIdSchema,
  jobRunSearchSchema,
} from "@/app/shared/schemas/jobs";
import type {
  JobLogLine,
  JobRunPage,
  JobView,
} from "@/app/shared/schemas/jobs";
import type { RuntimeView } from "@/app/shared/schemas/runtime";
import {
  resolveInstanceName,
  updateSettingsSchema,
} from "@/app/shared/schemas/settings";
import type { Settings } from "@/app/shared/schemas/settings";
import type { ShellView } from "@/app/shared/schemas/shell";
import type { SystemView } from "@/app/shared/schemas/system";
import { ReportableError } from "@/app/shared/utils/errors";
import { validate } from "@/app/shared/utils/validate";
import {
  LAYOUT_WIDTH_COOKIE,
  parseLayoutWidth,
} from "@/app/shared/utils/width";

// Looks the definition up rather than rebuilding it, so "what a job is" exists
// once. Throws for a name nothing registered.
const definitionOf = (name: string) => {
  ensureJobsRegistered();
  const definition = getJob(name);
  if (definition === undefined) {
    throw new ReportableError(`There is no job named ${name}.`);
  }
  return definition;
};

// One loader call rather than three: everything the shell renders before any
// page does.
export const getShell = createServerFn({ method: "GET" }).handler(
  async (): Promise<ShellView> => {
    const settings = await readSettings();
    return {
      width: parseLayoutWidth(getCookie(LAYOUT_WIDTH_COOKIE)),
      instanceName: resolveInstanceName(settings.instanceName),
      shortDateFormat: settings.shortDateFormat,
      longDateFormat: settings.longDateFormat,
      timeFormat: settings.timeFormat,
      showRelativeDates: settings.showRelativeDates,
    };
  },
);

// Each page loader is one round trip: a server function is an HTTP request of
// its own, and the settings page reloads on every autosave.
export const getSettingsPage = createServerFn({ method: "GET" }).handler(
  async (): Promise<{
    settings: Settings;
    apiKey: ApiKeyView;
    runtime: RuntimeView;
  }> => {
    const [settings, key] = await Promise.all([readSettings(), getApiKey()]);
    return {
      settings,
      apiKey: { key, envManaged: isEnvManaged() },
      runtime: getRuntimeInfo(),
    };
  },
);

export const regenerateKey = createServerFn({ method: "POST" }).handler(
  async (): Promise<ApiKeyView> => ({
    key: await regenerateApiKey(),
    envManaged: false,
  }),
);

export const updateSettings = createServerFn({ method: "POST" })
  .validator(validate(updateSettingsSchema))
  .handler(({ data }): Promise<Settings> => writeSettings(data));

export const getBackupsPage = createServerFn({ method: "GET" }).handler(
  async (): Promise<{ settings: Settings; backups: BackupsView }> => {
    const [settings, files, job] = await Promise.all([
      readSettings(),
      listBackups(),
      describeJob(definitionOf(BACKUP_JOB)),
    ]);
    return { settings, backups: { files, job } };
  },
);

// Goes through the same lock a scheduled run takes, so pressing the button
// mid-run cannot start a second one.
export const runJobNow = createServerFn({ method: "POST" })
  .validator(validate(jobNameSchema))
  .handler(async ({ data }): Promise<JobOutcome> => {
    const definition = definitionOf(data.name);
    const outcome = await runJob(definition);
    if (outcome === "failed") {
      throw new ReportableError(
        `${definition.title} did not complete. Its history shows why.`,
      );
    }
    return outcome;
  });

export const getJobsPage = createServerFn({ method: "GET" })
  .validator(validate(jobRunSearchSchema))
  .handler(
    async ({ data }): Promise<{ jobs: JobView[]; history: JobRunPage }> => {
      ensureJobsRegistered();
      const [jobs, history] = await Promise.all([
        Promise.all(listJobs().map(describeJob)),
        listJobRuns(data),
      ]);
      return { jobs, history };
    },
  );

export const getJobRunLogs = createServerFn({ method: "GET" })
  .validator(validate(jobRunIdSchema))
  .handler(async ({ data }): Promise<JobLogLine[]> => {
    const { entries } = await queryLogs({
      requestId: runCorrelationId(data.id),
      pageSize: 200,
    });
    return entries.map((entry) => ({
      time: entry.time,
      level: entry.level,
      namespace: entry.namespace,
      message: entry.message,
    }));
  });

// A server function rather than a route, because this replaces the entire
// database and server functions carry the CSRF middleware. An unauthenticated
// POST route would let any page the operator visits overwrite their data.
export const restoreFromUpload = createServerFn({ method: "POST" })
  .validator((data: FormData) => data)
  .handler(async ({ data }): Promise<void> => {
    const file = data.get("archive");
    if (!(file instanceof File)) {
      throw new ReportableError("No archive was uploaded.");
    }
    await restoreUpload(file);
  });

export const getSystem = createServerFn({ method: "GET" }).handler(
  (): Promise<SystemView> => getSystemInfo(),
);

// Not undoable — the file is gone — so the page confirms first, which is the
// one place this app diverges from its "delete, then offer undo" pattern.
export const removeBackup = createServerFn({ method: "POST" })
  .validator(validate(backupNameSchema))
  .handler(({ data }): Promise<void> => deleteBackup(data.name));
