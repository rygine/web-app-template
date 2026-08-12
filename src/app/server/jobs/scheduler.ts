import { listJobs, MINUTE_MS, SECOND_MS } from "@/app/server/jobs/registry";
import { dueAt, runDueJobs } from "@/app/server/jobs/runner";
import { createLogger } from "@/app/server/log/logger";

const log = createLogger("jobs");

export const MIN_DELAY_MS = SECOND_MS;

// The ceiling is also how quickly a changed interval takes effect: nothing on
// the request path can reach this timer, because the bundle gives the request
// path its own copy of this module. One minute costs one read per job per
// minute, and keeps a 30-day interval well clear of setTimeout's 2^31-1 limit.
export const MAX_DELAY_MS = MINUTE_MS;

let timer: NodeJS.Timeout | undefined;

export const nextDelay = async (): Promise<number> => {
  const dues = await Promise.all(listJobs().map((job) => dueAt(job)));
  if (dues.some((due) => due === null)) {
    return MIN_DELAY_MS;
  }
  const soonest = Math.min(...dues.map((due) => (due ?? 0) - Date.now()));
  return Math.min(Math.max(soonest, MIN_DELAY_MS), MAX_DELAY_MS);
};

const tick = async () => {
  try {
    await runDueJobs();
  } catch (error) {
    log.error("tick: sweep failed", { error });
  }
  await scheduleNext();
};

const scheduleNext = async (): Promise<void> => {
  clearTimeout(timer);
  const delay = await nextDelay();
  timer = setTimeout(() => void tick(), delay);
  // Never the reason the process stays alive; the server already is.
  timer.unref();
  log.trace("scheduleNext: next sweep", { ms: delay });
};

export const startScheduler = (): Promise<void> => scheduleNext();
