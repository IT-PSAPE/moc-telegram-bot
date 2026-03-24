# MOC Telegram Bot

This project has been rebuilt for Vercel Functions instead of Cloudflare Workers.

## Endpoints

- `POST /api/telegram`
  Telegram webhook endpoint. Telegram should send updates here.
- `POST /api/setup-webhook`
  Protected admin endpoint that calls Telegram's `setWebhook` API for you.

## Environment Variables

- `BOT_TOKEN`
  Telegram bot token from BotFather.
- `TELEGRAM_WEBHOOK_SECRET`
  Secret token passed to Telegram webhook configuration and validated on incoming webhook requests.
- `ADMIN_SECRET`
  Bearer token required for `POST /api/setup-webhook`.
- `HASHTAG_MAP_JSON`
  Optional JSON object mapping hashtags to target chat IDs.
  Example:
  `{"#ministryofculturepe":"-1001165512639","#mocrequestbotplayground":"-5070299647"}`
- `WEBHOOK_BASE_URL`
  Optional. Use this if the webhook should always point to a specific production URL.

## Local Development

```bash
bun install
bun run dev
```

## Deploying on Vercel

1. Import the repository into Vercel.
2. Add the environment variables in the Vercel project settings.
3. Deploy.
4. Configure the Telegram webhook:

```bash
curl -X POST "https://your-project.vercel.app/api/setup-webhook" \
  -H "Authorization: Bearer $ADMIN_SECRET"
```

## Behavioral Notes

- `/relay #tag` copies the command message into the mapped Telegram chat or chats.
- `/forward #tag` must be sent as a reply to the message you want copied.
- Album aggregation from the Cloudflare Worker version was removed because in-memory buffering is not reliable on stateless Vercel Functions. This rewrite is intentionally serverless-safe.
