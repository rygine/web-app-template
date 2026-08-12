// What the system page renders. The reader is server-only; the type is shared
// because the page renders it, and a client file may not import from server/.
export type SystemView = {
  appName: string;
  instanceName: string;
  version: string;
  startedAt: Date;
  node: string;
  platform: string;
  latestMigration: string | null;
  migrationCount: number;
  databaseBytes: number;
  dataDir: string;
  logsDir: string;
  logCount: number;
};
