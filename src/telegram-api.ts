type TelegramApiResult = {
  ok: boolean;
  description?: string;
  result?: unknown;
};

type SetWebhookInput = {
  token: string;
  webhookUrl: string;
  secretToken: string;
};

type CopyMessageInput = {
  token: string;
  targetChatId: string;
  fromChatId: string;
  messageId: number;
};

type SendMessageInput = {
  token: string;
  chatId: number;
  text: string;
};

export async function setTelegramWebhook(input: SetWebhookInput): Promise<TelegramApiResult> {
  return callTelegramApi(input.token, "setWebhook", {
    url: input.webhookUrl,
    secret_token: input.secretToken,
    allowed_updates: ["message", "edited_message"],
    drop_pending_updates: false,
  });
}

export async function copyTelegramMessage(input: CopyMessageInput): Promise<TelegramApiResult> {
  return callTelegramApi(input.token, "copyMessage", {
    chat_id: input.targetChatId,
    from_chat_id: input.fromChatId,
    message_id: input.messageId,
    disable_notification: true,
  });
}

export async function sendTelegramMessage(input: SendMessageInput): Promise<TelegramApiResult> {
  return callTelegramApi(input.token, "sendMessage", {
    chat_id: input.chatId,
    text: input.text,
    disable_notification: true,
  });
}

async function callTelegramApi(
  token: string,
  method: string,
  body: Record<string, unknown>,
): Promise<TelegramApiResult> {
  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: {
      "content-type": "application/json; charset=utf-8",
    },
    body: JSON.stringify(body),
  });

  const data = (await response.json().catch(() => null)) as TelegramApiResult | null;

  if (!response.ok) {
    const description = data?.description ?? `Telegram API returned HTTP ${response.status}.`;
    throw new Error(description);
  }

  return data ?? { ok: false, description: "Telegram API returned an empty response." };
}
