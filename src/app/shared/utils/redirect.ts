// Only a path on this site; URL parsing catches "//host", "/\host", and "/<tab>/host".
export const safeRedirect = (target: string | undefined): string => {
  if (target === undefined || !target.startsWith("/")) {
    return "/";
  }
  const url = new URL(target, "http://local.invalid");
  return url.origin === "http://local.invalid" ? target : "/";
};
