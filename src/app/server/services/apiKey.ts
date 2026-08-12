import { randomBytes, timingSafeEqual } from "node:crypto";

import { createLogger } from "@/app/server/log/logger";
import { envValue } from "@/app/server/utils/env";
import { prisma } from "@/app/server/utils/prisma";

const log = createLogger("apikey");

const APP_API_KEY_ID = "app";

const generate = () => randomBytes(16).toString("hex");

const fromEnv = () => envValue("API_KEY");

export const isEnvManaged = () => fromEnv() !== undefined;

export const getApiKey = async (): Promise<string> => {
  const override = fromEnv();
  if (override !== undefined) {
    log.trace("getApiKey: key from environment");
    return override;
  }
  const row = await prisma.apiKey.findUnique({ where: { id: APP_API_KEY_ID } });
  if (row) {
    log.trace("getApiKey: key from store");
    return row.key;
  }
  const key = generate();
  try {
    const created = await prisma.apiKey.create({
      data: { id: APP_API_KEY_ID, key },
    });
    log.info("getApiKey: key generated");
    return created.key;
  } catch {
    log.warn("getApiKey: key creation lost a race, reading the winner");
    const existing = await prisma.apiKey.findUnique({
      where: { id: APP_API_KEY_ID },
    });
    if (!existing) {
      throw new Error("API key could not be created");
    }
    return existing.key;
  }
};

export const regenerateApiKey = async (): Promise<string> => {
  if (isEnvManaged()) {
    throw new Error(
      "API_KEY is set in the environment and cannot be changed here.",
    );
  }
  const key = generate();
  const row = await prisma.apiKey.upsert({
    where: { id: APP_API_KEY_ID },
    create: { id: APP_API_KEY_ID, key },
    update: { key },
  });
  log.info("regenerateApiKey: key replaced");
  return row.key;
};

export const verifyApiKey = async (apiKey: string): Promise<boolean> => {
  const expected = await getApiKey();
  const key = Buffer.from(apiKey);
  const expectedKey = Buffer.from(expected);
  if (key.length !== expectedKey.length) {
    log.trace("verifyApiKey: key length mismatch");
    return false;
  }
  return timingSafeEqual(key, expectedKey);
};
