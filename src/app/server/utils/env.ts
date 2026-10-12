// An empty variable counts as unset: compose passes `${NAME:-}`, which arrives
// as an empty string when nothing was set.
export const envValue = (name: string): string | undefined => {
  const value = process.env[name];
  return value !== undefined && value.length > 0 ? value : undefined;
};
