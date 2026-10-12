// Paths with their own checks: the API key, the function middleware, none.
const OPEN_PREFIXES = ["/api/", "/_serverFn"];

const PUBLIC_FUNCTIONS = new Set(["getShell", "login", "setup", "logout"]);

// The largest body a POST without a session may send.
const MAX_PUBLIC_BODY_BYTES = 65_536;

export const isOpenPath = (pathname: string): boolean =>
  pathname === "/health" ||
  OPEN_PREFIXES.some((prefix) => pathname.startsWith(prefix));

export const gateDocument = async ({
  pathname,
  hasUser,
  signedIn,
}: {
  pathname: string;
  hasUser: boolean;
  signedIn: () => Promise<boolean>;
}): Promise<"allow" | "login" | "setup"> => {
  if (isOpenPath(pathname)) {
    return "allow";
  }
  if (!hasUser) {
    return pathname === "/setup" ? "allow" : "setup";
  }
  if (pathname === "/setup") {
    return "login";
  }
  if (pathname === "/login") {
    return "allow";
  }
  return (await signedIn()) ? "allow" : "login";
};

export const refusesBody = async ({
  method,
  pathname,
  contentLength,
  signedIn,
}: {
  method: string;
  pathname: string;
  contentLength: string | null;
  signedIn: () => Promise<boolean>;
}): Promise<boolean> => {
  if (method !== "POST" || !pathname.startsWith("/_serverFn")) {
    return false;
  }
  if (
    contentLength !== null &&
    Number(contentLength) <= MAX_PUBLIC_BODY_BYTES
  ) {
    return false;
  }
  return !(await signedIn());
};

export const isPublicFunction = ({
  name,
  filename,
}: {
  name: string;
  filename: string;
}): boolean =>
  filename.endsWith("src/app/rpc.ts") && PUBLIC_FUNCTIONS.has(name);
