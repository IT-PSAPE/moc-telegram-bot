import type { RuntimeConfig } from "./types.js";

const DEFAULT_HASHTAG_MAP: Record<string, string> = {
  "#ministryofculturepe": "-1001165512639",
  "#botplayground": "-5070299647",
};

export function loadRuntimeConfig(): RuntimeConfig {
  const botToken = process.env.BOT_TOKEN?.trim();
  if (!botToken) {
    throw new Error("BOT_TOKEN is required.");
  }

  return {
    botToken,
    hashtagMap: loadHashtagMap(),
  };
}

export function getWebhookSecret(): string {
  const webhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET?.trim();
  if (!webhookSecret) {
    throw new Error("TELEGRAM_WEBHOOK_SECRET is required.");
  }

  return webhookSecret;
}

export function getAdminSecret(): string {
  const adminSecret = process.env.ADMIN_SECRET?.trim();
  if (!adminSecret) {
    throw new Error("ADMIN_SECRET is required.");
  }

  return adminSecret;
}

export function createJsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

function loadHashtagMap(): Record<string, string> {
  const rawMap = process.env.HASHTAG_MAP_JSON?.trim();
  if (!rawMap) {
    return DEFAULT_HASHTAG_MAP;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawMap);
  } catch {
    throw new Error("HASHTAG_MAP_JSON must be valid JSON.");
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("HASHTAG_MAP_JSON must be a JSON object.");
  }

  const normalizedEntries = Object.entries(parsed).map(([key, value]) => {
    if (typeof value !== "string" || !value.trim()) {
      throw new Error(`Invalid chat id configured for hashtag "${key}".`);
    }

    return [key.toLowerCase(), value.trim()] as const;
  });

  return Object.fromEntries(normalizedEntries);
}
