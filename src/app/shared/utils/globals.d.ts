import type { LogLevel } from "@/app/shared/utils/log";

declare global {
  var logLevel: LogLevel | undefined;
}
