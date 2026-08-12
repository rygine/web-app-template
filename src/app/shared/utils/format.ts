const UNITS = [
  { limit: 60_000, ms: 1000, unit: "second" },
  { limit: 3_600_000, ms: 60_000, unit: "minute" },
  { limit: 86_400_000, ms: 3_600_000, unit: "hour" },
  { limit: Number.POSITIVE_INFINITY, ms: 86_400_000, unit: "day" },
] as const;

const unitFor = (ms: number) =>
  UNITS.find(({ limit }) => ms < limit) ?? UNITS[3];

// Built on first use, not at import: the ambient locale is baked in at
// construction, so this may only render on a route that opts out of SSR.
let relativeTime: Intl.RelativeTimeFormat | undefined;

export const formatSince = (date: Date): string => {
  const diff = date.getTime() - Date.now();
  const { ms, unit } = unitFor(Math.abs(diff));
  relativeTime ??= new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
  return relativeTime.format(Math.round(diff / ms), unit);
};

export const formatBytes = (bytes: number): string => {
  if (bytes < 1000) {
    return `${bytes} B`;
  }
  if (bytes < 1_000_000) {
    return `${Math.round(bytes / 1000)} KB`;
  }
  return `${(bytes / 1_000_000).toFixed(1)} MB`;
};

export const formatDuration = (ms: number | null): string =>
  ms === null ? "—" : ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;

// "Every 7 days" rather than a duration, because a schedule reads as a cadence.
export const formatInterval = (ms: number): string => {
  const { ms: step, unit } = unitFor(ms);
  const count = Math.max(1, Math.round(ms / step));
  return count === 1 ? `Every ${unit}` : `Every ${count} ${unit}s`;
};
