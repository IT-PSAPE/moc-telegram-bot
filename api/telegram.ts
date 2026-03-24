import { waitUntil } from "@vercel/functions";

import { createJsonResponse, getWebhookSecret, loadRuntimeConfig } from "../src/config.js";
import { handleTelegramUpdate } from "../src/telegram-bot.js";
import type { TelegramUpdate } from "../src/types.js";

export const runtime = "nodejs";
export const maxDuration = 10;

export default {
  async fetch(request: Request): Promise<Response> {
    if (request.method === "GET" || request.method === "HEAD") {
      return createJsonResponse(
        {
          ok: true,
          service: "moc-telegram-bot",
          runtime: "vercel",
        },
        200,
      );
    }

    if (request.method !== "POST") {
      return createJsonResponse({ ok: false, error: "Method not allowed" }, 405);
    }

    const webhookSecret = getWebhookSecret();
    const requestSecret = request.headers.get("x-telegram-bot-api-secret-token");

    if (requestSecret !== webhookSecret) {
      return createJsonResponse({ ok: false, error: "Unauthorized" }, 401);
    }

    let update: TelegramUpdate;

    try {
      update = (await request.json()) as TelegramUpdate;
    } catch {
      return createJsonResponse({ ok: true, ignored: true }, 200);
    }

    if (typeof update?.update_id !== "number") {
      return createJsonResponse({ ok: true, ignored: true }, 200);
    }

    const config = loadRuntimeConfig();
    waitUntil(handleTelegramUpdate(update, config));

    return createJsonResponse({ ok: true }, 200);
  },
};
