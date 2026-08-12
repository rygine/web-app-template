export type LogLevel = "trace" | "debug" | "info" | "warn" | "error" | "off";
export type LogFields = Record<string, unknown>;

export type EmittedLevel = Exclude<LogLevel, "off">;

export type LogRecord = {
  time: Date;
  level: EmittedLevel;
  namespace: string;
  message: string;
  fields?: LogFields;
  errors: Error[];
};

export type LogHandler = (record: LogRecord) => void;

export type Logger = Record<
  EmittedLevel,
  (message: string, fields?: LogFields) => void
>;

export const LOG_RANK: Record<LogLevel, number> = {
  trace: 10,
  debug: 20,
  info: 30,
  warn: 40,
  error: 50,
  off: 100,
};

const DEFAULT_LEVEL: LogLevel = "debug";

const CONSOLE_METHOD: Record<
  EmittedLevel,
  "debug" | "info" | "warn" | "error"
> = {
  trace: "debug",
  debug: "debug",
  info: "info",
  warn: "warn",
  error: "error",
};

export const isLogLevel = (value: unknown): value is LogLevel =>
  typeof value === "string" && Object.hasOwn(LOG_RANK, value);

let currentLevel: LogLevel | undefined;

// Filled once at startup by loadLogLevel, and again by the settings mutation,
// so a change is live without a restart. Only the read that fills it is
// asynchronous; the lookup below stays synchronous, which is what lets this
// module remain isomorphic and free of the database.
export const setLogLevel = (level: LogLevel) => {
  currentLevel = level;
};

export const clearLogLevel = () => {
  currentLevel = undefined;
};

const getLogLevel = (): LogLevel => {
  const fromNode =
    typeof process === "undefined" ? undefined : process.env.LOG_LEVEL;
  if (isLogLevel(fromNode)) {
    return fromNode;
  }
  if (currentLevel !== undefined) {
    return currentLevel;
  }
  const fromVite = import.meta.env.VITE_LOG_LEVEL;
  if (isLogLevel(fromVite)) {
    return fromVite;
  }
  return DEFAULT_LEVEL;
};

const render = (value: unknown) =>
  value instanceof Error ? value.message : String(value);

export const formatFields = (fields: LogFields): Record<string, string> =>
  Object.fromEntries(
    Object.entries(fields).map(([key, value]) => [key, render(value)]),
  );

// The human-readable line; never for a file, because it cannot be parsed back.
export const formatLine = ({
  level,
  namespace,
  message,
  fields,
}: Pick<LogRecord, "namespace" | "message" | "fields"> & { level: string }) => {
  const tail = fields
    ? Object.entries(fields)
        .map(([key, value]) => ` ${key}=${render(value)}`)
        .join("")
    : "";
  return `${level.padEnd(5)} [${namespace}] ${message}${tail}`;
};

export const consoleLogHandler: LogHandler = (record) => {
  console[CONSOLE_METHOD[record.level]](formatLine(record), ...record.errors);
};

export const createLogger = (
  namespace: string,
  ...handlers: LogHandler[]
): Logger => {
  const active = handlers.length > 0 ? handlers : [consoleLogHandler];

  // Read per record, not captured here: a level change has to reach loggers
  // that already exist, and a module-level lookup is a property read.
  const emit = (level: EmittedLevel, message: string, fields?: LogFields) => {
    if (LOG_RANK[level] < LOG_RANK[getLogLevel()]) {
      return;
    }
    const errors = fields
      ? Object.values(fields).filter((value) => value instanceof Error)
      : [];
    const record: LogRecord = {
      time: new Date(),
      level,
      namespace,
      message,
      fields,
      errors,
    };
    for (const handler of active) {
      handler(record);
    }
  };

  return {
    trace: (message, fields) => emit("trace", message, fields),
    debug: (message, fields) => emit("debug", message, fields),
    info: (message, fields) => emit("info", message, fields),
    warn: (message, fields) => emit("warn", message, fields),
    error: (message, fields) => emit("error", message, fields),
  };
};
