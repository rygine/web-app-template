import {
  deleteCookie,
  getCookie,
  getRequest,
  getRequestIP,
  setCookie,
} from "@tanstack/react-start/server";

import { verifySession } from "@/app/server/services/auth";
import { isLocalAddress } from "@/app/server/utils/address";
import type { AuthMode } from "@/app/shared/schemas/auth";

const SESSION_COOKIE = "session";
// 400 days, the browser cap.
const COOKIE_MAX_AGE_S = 400 * 24 * 60 * 60;

export const sessionToken = (): string | undefined => getCookie(SESSION_COOKIE);

export const isSignedIn = async (authMode: AuthMode): Promise<boolean> => {
  if (authMode === "forms-except-local" && isLocalAddress(getRequestIP())) {
    return true;
  }
  return verifySession(sessionToken());
};

export const setSessionCookie = (token: string): void => {
  setCookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: new URL(getRequest().url).protocol === "https:",
    path: "/",
    maxAge: COOKIE_MAX_AGE_S,
  });
};

export const clearSessionCookie = (): void => {
  deleteCookie(SESSION_COOKIE, { path: "/" });
};
