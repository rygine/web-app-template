import { createHash, randomBytes, scrypt, timingSafeEqual } from "node:crypto";

import { DAY_MS, HOUR_MS } from "@/app/server/jobs/registry";
import { createLogger } from "@/app/server/log/logger";
import { prisma } from "@/app/server/utils/prisma";
import {
  authModeSchema,
  credentialsSchema,
  loginSchema,
} from "@/app/shared/schemas/auth";
import type { AuthMode } from "@/app/shared/schemas/auth";
import { SETTINGS_ID } from "@/app/shared/schemas/settings";
import { ReportableError } from "@/app/shared/utils/errors";

const log = createLogger("auth");

const KEY_LENGTH = 64;
export const SESSION_TTL_MS = 30 * DAY_MS;
// A session is renewed at most once per this interval.
const RENEW_AFTER_MS = HOUR_MS;
const MAX_FAILED_LOGINS = 5;
const FAILED_LOGIN_WINDOW_MS = 60_000;

const derive = (password: string, salt: Buffer) =>
  new Promise<Buffer>((resolve, reject) => {
    scrypt(password, salt, KEY_LENGTH, (error, key) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(key);
    });
  });

export const hashPassword = async (password: string): Promise<string> => {
  const salt = randomBytes(16);
  const key = await derive(password, salt);
  return `scrypt$${salt.toString("base64")}$${key.toString("base64")}`;
};

export const verifyPassword = async (
  password: string,
  stored: string,
): Promise<boolean> => {
  const [scheme, salt, key] = stored.split("$");
  if (scheme !== "scrypt" || salt === undefined || key === undefined) {
    return false;
  }
  const expected = Buffer.from(key, "base64");
  const actual = await derive(password, Buffer.from(salt, "base64"));
  return actual.length === expected.length && timingSafeEqual(actual, expected);
};

export const getAuthConfig = async (): Promise<{
  authMode: AuthMode;
  hasUser: boolean;
}> => {
  const row = await prisma.setting.findUnique({
    where: { id: SETTINGS_ID },
    select: { authMode: true, passwordHash: true },
  });
  return {
    authMode: authModeSchema.catch("forms").parse(row?.authMode),
    hasUser: Boolean(row?.passwordHash),
  };
};

export const setupUser = async (input: unknown): Promise<void> => {
  const { username, password } = credentialsSchema.parse(input);
  const passwordHash = await hashPassword(password);
  await prisma.setting.upsert({
    where: { id: SETTINGS_ID },
    update: {},
    create: { id: SETTINGS_ID },
  });
  // Writes only while no account exists, so two requests cannot both win.
  const { count } = await prisma.setting.updateMany({
    where: { id: SETTINGS_ID, passwordHash: null },
    data: { username, passwordHash },
  });
  if (count === 0) {
    log.warn("setupUser: an account already exists");
    throw new ReportableError("An account already exists. Log in instead.");
  }
  log.info("setupUser: account created");
};

export const checkCredentials = async (input: unknown): Promise<boolean> => {
  const { username, password } = loginSchema.parse(input);
  const now = Date.now();
  const failures = (globalThis.loginFailures ??= []);
  while (failures.length > 0 && now - failures[0]! >= FAILED_LOGIN_WINDOW_MS) {
    failures.shift();
  }
  if (failures.length >= MAX_FAILED_LOGINS) {
    throw new ReportableError(
      "Too many failed logins. Wait a minute, then try again.",
    );
  }
  failures.push(now);
  const row = await prisma.setting.findUnique({
    where: { id: SETTINGS_ID },
    select: { username: true, passwordHash: true },
  });
  if (!row?.passwordHash) {
    return false;
  }
  const passwordMatches = await verifyPassword(password, row.passwordHash);
  if (!passwordMatches || row.username !== username) {
    log.info("checkCredentials: login rejected");
    if (failures.length >= MAX_FAILED_LOGINS) {
      log.warn(
        "checkCredentials: too many failed logins; refusing for a minute",
      );
    }
    return false;
  }
  const attempt = failures.indexOf(now);
  if (attempt !== -1) {
    failures.splice(attempt, 1);
  }
  return true;
};

const hashToken = (token: string) =>
  createHash("sha256").update(token).digest("hex");

export const createSession = async (): Promise<string> => {
  await prisma.session.deleteMany({
    where: { expiresAt: { lte: new Date() } },
  });
  const token = randomBytes(32).toString("base64url");
  await prisma.session.create({
    data: {
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + SESSION_TTL_MS),
    },
  });
  log.info("createSession: session created");
  return token;
};

export const verifySession = async (
  token: string | undefined,
): Promise<boolean> => {
  if (token === undefined) {
    return false;
  }
  const tokenHash = hashToken(token);
  const row = await prisma.session.findUnique({ where: { tokenHash } });
  const now = Date.now();
  if (!row || row.expiresAt.getTime() <= now) {
    log.trace("verifySession: no live session");
    return false;
  }
  if (now - row.lastSeenAt.getTime() > RENEW_AFTER_MS) {
    await prisma.session.updateMany({
      where: { tokenHash },
      data: {
        lastSeenAt: new Date(now),
        expiresAt: new Date(now + SESSION_TTL_MS),
      },
    });
  }
  return true;
};

export const deleteSession = async (
  token: string | undefined,
): Promise<void> => {
  if (token === undefined) {
    return;
  }
  await prisma.session.deleteMany({ where: { tokenHash: hashToken(token) } });
  log.info("deleteSession: session ended");
};

export const resetAuth = async (): Promise<void> => {
  await prisma.$transaction([
    prisma.setting.updateMany({ data: { username: null, passwordHash: null } }),
    prisma.session.deleteMany(),
  ]);
  log.warn(
    "resetAuth: account and sessions removed; remove RESET_AUTH or they reset at every restart",
  );
};
