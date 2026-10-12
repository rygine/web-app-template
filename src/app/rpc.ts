import { createServerFn } from "@tanstack/react-start";
import { getCookie } from "@tanstack/react-start/server";

import {
  deleteBackup,
  listBackups,
  pruneBackups,
  resolveBackupPath,
} from "@/app/server/jobs/backup";
import { listJobRuns, runCorrelationId } from "@/app/server/jobs/history";
import { BACKUP_JOB, ensureJobsRegistered } from "@/app/server/jobs/jobs";
import { getJob, listJobs } from "@/app/server/jobs/registry";
import {
  restoreBackup,
  restoreFromUpload as restoreUpload,
} from "@/app/server/jobs/restore";
import { describeJob, runJob } from "@/app/server/jobs/runner";
import type { JobOutcome } from "@/app/server/jobs/runner";
import { listLogSources, queryLogs } from "@/app/server/log/query";
import {
  getApiKey,
  isEnvManaged,
  regenerateApiKey,
} from "@/app/server/services/apiKey";
import {
  checkCredentials,
  createSession,
  deleteSession,
  setupUser,
} from "@/app/server/services/auth";
import {
  getSettings as readSettings,
  updateSettings as writeSettings,
} from "@/app/server/services/settings";
import { getRuntimeInfo } from "@/app/server/utils/runtime";
import {
  clearSessionCookie,
  sessionToken,
  setSessionCookie,
} from "@/app/server/utils/session";
import { getSystemInfo } from "@/app/server/utils/system";
import type { ApiKeyView } from "@/app/shared/schemas/apiKey";
import { credentialsSchema, loginSchema } from "@/app/shared/schemas/auth";
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
import { logSearchSchema } from "@/app/shared/schemas/logs";
import type { LogPage } from "@/app/shared/schemas/logs";
import type { RuntimeView } from "@/app/shared/schemas/runtime";
import {
  resolveInstanceName,
  updateSettingsSchema,
} from "@/app/shared/schemas/settings";
import type { Settings } from "@/app/shared/schemas/settings";
import type { ShellView } from "@/app/shared/schemas/shell";
import type { SystemView } from "@/app/shared/schemas/system";
import { NotFoundError, ReportableError } from "@/app/shared/utils/errors";
import { validate } from "@/app/shared/utils/validate";
import {
  LAYOUT_WIDTH_COOKIE,
  parseLayoutWidth,
} from "@/app/shared/utils/width";

// The registered definition, or a ReportableError for a name nothing registered.
const definitionOf = (name: string) => {
  ensureJobsRegistered();
  const definition = getJob(name);
  if (definition === undefined) {
    throw new ReportableError(`There is no job named ${name}.`);
  }
  return definition;
};

// Everything the shell renders before any page does.
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
  async (): Promise<{ backups: BackupsView }> => {
    const [files, job] = await Promise.all([
      listBackups(),
      describeJob(definitionOf(BACKUP_JOB)),
    ]);
    return { backups: { files, job } };
  },
);

// Takes the same lock as a scheduled run.
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
  .handler(
    async ({ data }): Promise<{ lines: JobLogLine[]; total: number }> => {
      const { entries, total } = await queryLogs({
        requestId: runCorrelationId(data.id),
        pageSize: 200,
      });
      return {
        lines: entries.map((entry) => ({
          time: entry.time,
          level: entry.level,
          namespace: entry.namespace,
          message: entry.message,
        })),
        total,
      };
    },
  );

export const getLogsPage = createServerFn({ method: "GET" })
  .validator(validate(logSearchSchema))
  .handler(async ({ data }): Promise<LogPage> => {
    const [{ entries, total, pageCount }, sources] = await Promise.all([
      queryLogs({
        exactLevel: data.level === "all" ? undefined : data.level,
        namespaces: data.sources,
        search: data.search,
        page: data.page,
        pageSize: data.size,
      }),
      listLogSources(),
    ]);
    return {
      entries: entries.map((entry) => ({
        time: entry.time,
        level: entry.level,
        namespace: entry.namespace,
        message: entry.message,
        fields: entry.fields ?? {},
        errors: entry.errors ?? [],
        requestId: entry.requestId ?? null,
      })),
      total,
      pageCount,
      sources,
    };
  });

// A server function, so the CSRF middleware covers this database replacement.
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

// Not undoable — the file is gone — so the page confirms first.
export const removeBackup = createServerFn({ method: "POST" })
  .validator(validate(backupNameSchema))
  .handler(({ data }): Promise<void> => deleteBackup(data.name));

export const restoreFromBackup = createServerFn({ method: "POST" })
  .validator(validate(backupNameSchema))
  .handler(async ({ data }): Promise<void> => {
    const path = await resolveBackupPath(data.name);
    if (path === null) {
      throw new NotFoundError("That backup does not exist.");
    }
    await restoreBackup(path);
  });

export const cleanUpBackups = createServerFn({ method: "POST" }).handler(
  (): Promise<number> => pruneBackups(),
);

// The four public functions: src/app/server/utils/gate.ts names them.
export const setup = createServerFn({ method: "POST" })
  .validator(validate(credentialsSchema))
  .handler(async ({ data }): Promise<void> => {
    await setupUser(data);
    setSessionCookie(await createSession());
  });

export const login = createServerFn({ method: "POST" })
  .validator(validate(loginSchema))
  .handler(async ({ data }): Promise<void> => {
    if (!(await checkCredentials(data))) {
      throw new ReportableError("The username or password is incorrect.");
    }
    setSessionCookie(await createSession());
  });

export const logout = createServerFn({ method: "POST" }).handler(
  async (): Promise<void> => {
    await deleteSession(sessionToken());
    clearSessionCookie();
  },
);
