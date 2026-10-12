// What the process is running with, as the settings page receives it. The type
// is shared because the page renders it; the reader is server-only.
export type RuntimeView = {
  port: string;
  host: string;
  dataDir: string;
  logsDir: string;
  logLevelEnvManaged: boolean;
};
