export const SECOND_MS = 1000;
export const MINUTE_MS = 60 * SECOND_MS;
export const HOUR_MS = 60 * MINUTE_MS;
export const DAY_MS = 24 * HOUR_MS;

export type JobContext = {
  report: (percent: number, note?: string) => void;
};

export type JobDefinition = {
  name: string;
  // A label for the settings page, so the UI never has to map names to prose.
  title: string;

  intervalMs: number | (() => Promise<number>);
  run: (context: JobContext) => Promise<void>;
};

const jobs = new Map<string, JobDefinition>();

export const registerJob = (definition: JobDefinition) => {
  if (jobs.has(definition.name)) {
    throw new Error(`A job named ${definition.name} is already registered.`);
  }
  jobs.set(definition.name, definition);
};

export const listJobs = (): JobDefinition[] => [...jobs.values()];

export const getJob = (name: string): JobDefinition | undefined =>
  jobs.get(name);

export const clearJobs = () => {
  jobs.clear();
};

export const intervalOf = async (definition: JobDefinition): Promise<number> =>
  typeof definition.intervalMs === "number"
    ? definition.intervalMs
    : definition.intervalMs();
