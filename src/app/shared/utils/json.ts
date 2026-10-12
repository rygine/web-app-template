export const safeJson = (json: string | null): unknown => {
  if (json === null) {
    return null;
  }
  try {
    return JSON.parse(json);
  } catch {
    return null;
  }
};
