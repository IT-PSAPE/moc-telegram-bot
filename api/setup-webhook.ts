import { createJsonResponse, getAdminSecret, getWebhookSecret, loadRuntimeConfig } from "../src/config.js";
import { setTelegramWebhook } from "../src/telegram-api.js";

export const runtime = "nodejs";
export const maxDuration = 10;

export default {
  async fetch(request: Request): Promise<Response> {
    if (request.method !== "POST") {
      return createJsonResponse(
        {
          ok: false,
          error: "Use POST with Authorization: Bearer <ADMIN_SECRET> to configure the webhook.",
        },
        405,
      );
    }

    const adminSecret = getAdminSecret();
    const authHeader = request.headers.get("authorization");
    const expectedHeader = `Bearer ${adminSecret}`;

    if (authHeader !== expectedHeader) {
      return createJsonResponse({ ok: false, error: "Unauthorized" }, 401);
    }

    const config = loadRuntimeConfig();
    const webhookUrl = buildWebhookUrl(request);

    const result = await setTelegramWebhook({
      token: config.botToken,
      webhookUrl,
      secretToken: getWebhookSecret(),
    });

    return createJsonResponse(
      {
        ok: result.ok,
        webhookUrl,
        telegram: result,
      },
      result.ok ? 200 : 502,
    );
  },
};

function buildWebhookUrl(request: Request): string {
  const configuredBaseUrl = process.env.WEBHOOK_BASE_URL?.trim();
  if (configuredBaseUrl) {
    return `${configuredBaseUrl.replace(/\/$/, "")}/api/telegram`;
  }

  const productionUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  if (productionUrl) {
    return `https://${productionUrl.replace(/^https?:\/\//, "").replace(/\/$/, "")}/api/telegram`;
  }

  const requestUrl = new URL(request.url);
  return `${requestUrl.origin}/api/telegram`;
}
