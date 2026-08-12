import { fork } from "node:child_process";
import { join } from "node:path";

import { MINUTE_MS } from "@/app/server/jobs/registry";
import { createLogger } from "@/app/server/log/logger";

const DEFAULT_TIMEOUT_MS = 30 * MINUTE_MS;

// Forked as a file at run time, from the one directory the Dockerfile copies.
export const workerPath = (name: string) =>
  join(process.cwd(), "src/app/server/jobs/workers", `${name}.ts`);

const log = createLogger("jobs");

export type WorkerOptions = {
  timeoutMs?: number;
  onProgress?: (message: unknown) => void;
};

export const runWorker = (
  entry: string,
  payload: unknown,
  { timeoutMs = DEFAULT_TIMEOUT_MS, onProgress }: WorkerOptions = {},
): Promise<void> =>
  new Promise((resolve, reject) => {
    const child = fork(entry, [JSON.stringify(payload)], {
      stdio: ["ignore", "pipe", "pipe", "ipc"],
      // The zip API is experimental and says so on stderr once per process,
      // which the relay below would otherwise log as a warning on every run.
      execArgv: [...process.execArgv, "--disable-warning=ExperimentalWarning"],
    });

    let stderr = "";

    const relay = (level: "debug" | "warn") => (chunk: Buffer) => {
      const text = chunk.toString();
      if (level === "warn") {
        stderr += text;
      }
      for (const line of text.split("\n")) {
        if (line.trim().length > 0) {
          log[level]("worker: output", { line });
        }
      }
    };

    child.stdout?.on("data", relay("debug"));
    child.stderr?.on("data", relay("warn"));

    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`${entry} timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    if (onProgress) {
      child.on("message", (message: unknown) => onProgress(message));
    }

    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });

    child.on("exit", (code, signal) => {
      clearTimeout(timer);
      if (code === 0) {
        resolve();
        return;
      }
      const how = signal === null ? `exited ${code}` : `was killed (${signal})`;
      reject(new Error(`${entry} ${how}: ${stderr.trim()}`));
    });
  });
