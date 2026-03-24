import { copyTelegramMessage, sendTelegramMessage } from "./telegram-api.js";
import type { RuntimeConfig, TelegramMessage, TelegramUpdate } from "./types.js";

export async function handleTelegramUpdate(update: TelegramUpdate, config: RuntimeConfig): Promise<void> {
  const message = update.message ?? update.edited_message;
  if (!message) {
    return;
  }

  const text = getMessageText(message);
  const isRelay = hasCommand(text, "relay");
  const isForward = hasCommand(text, "forward");

  if (!isRelay && !isForward) {
    return;
  }

  if (isRelay) {
    await handleRelay(message, config);
    return;
  }

  await handleForward(message, config);
}

async function handleRelay(message: TelegramMessage, config: RuntimeConfig): Promise<void> {
  const targetChatIds = getTargetChatIds(getMessageText(message), config.hashtagMap);
  if (targetChatIds.length === 0) {
    return;
  }

  await Promise.all(
    targetChatIds.map((targetChatId) =>
      copyTelegramMessage({
        token: config.botToken,
        targetChatId,
        fromChatId: String(message.chat.id),
        messageId: message.message_id,
      }),
    ),
  );
}

async function handleForward(message: TelegramMessage, config: RuntimeConfig): Promise<void> {
  const reply = message.reply_to_message;
  if (!reply) {
    await sendTelegramMessage({
      token: config.botToken,
      chatId: message.chat.id,
      text: "Reply to a message with /forward and at least one mapped hashtag.",
    });
    return;
  }

  const targetChatIds = getTargetChatIds(getMessageText(message), config.hashtagMap);
  if (targetChatIds.length === 0) {
    return;
  }

  await Promise.all(
    targetChatIds.map((targetChatId) =>
      copyTelegramMessage({
        token: config.botToken,
        targetChatId,
        fromChatId: String(reply.chat.id),
        messageId: reply.message_id,
      }),
    ),
  );
}

function getTargetChatIds(text: string, hashtagMap: Record<string, string>): string[] {
  const hashtags = extractHashtags(text);
  const targets = hashtags
    .map((hashtag) => hashtagMap[hashtag])
    .filter((chatId): chatId is string => Boolean(chatId?.trim()));

  return [...new Set(targets)];
}

function getMessageText(message: TelegramMessage): string {
  return (message.text ?? message.caption ?? "").trim();
}

function hasCommand(text: string, commandName: string): boolean {
  return text
    .split(/\s+/)
    .some((part) => new RegExp(`^/${commandName}(?:@[_a-zA-Z0-9]+)?$`, "i").test(part));
}

function extractHashtags(text: string): string[] {
  const hashtags = Array.from(text.matchAll(/#[\p{L}0-9_]+/giu)).map((match) =>
    match[0].toLowerCase(),
  );

  return [...new Set(hashtags)];
}
