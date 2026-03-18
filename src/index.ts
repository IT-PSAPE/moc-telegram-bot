export type Env = {
  BOT_TOKEN: string;
};

// === Configuration ===
// Add your hashtag -> target chat id mapping here.
// Chat IDs for groups are usually negative (e.g. -1001234567890).
const HASHTAG_MAP: Record<string, string> = {
  "#groupb": "-1001234567890",
};

// When handling media groups (albums), we buffer incoming messages briefly so we can
// send the complete album in one request.
const albumCache = new Map<
  string,
  {
    targets: Set<string>;
    messages: TelegramMessage[];
    timer?: number;
  }
>();

// Simple de-duplication for incoming update_ids (per worker instance).
const seenUpdates = new Map<number, number>();
const SEEN_TTL_MS = 5 * 60 * 1000;

// --- Types ---
export type TelegramUpdate = {
  update_id: number;
  message?: TelegramMessage;
  edited_message?: TelegramMessage;
};

export type TelegramMessage = {
  message_id: number;
  date: number;
  chat: { id: number; type: string };
  from?: { id: number; is_bot?: boolean; first_name?: string; username?: string };
  text?: string;
  caption?: string;
  media_group_id?: string;
  reply_to_message?: TelegramMessage;
  photo?: any[];
  video?: any;
  document?: any;
  animation?: any;
  // ... other fields are intentionally omitted for brevity
};

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext) {
    if (request.method !== "POST") {
      return new Response("OK", { status: 200 });
    }

    let update: TelegramUpdate;
    try {
      update = await request.json();
    } catch {
      return new Response("OK", { status: 200 });
    }

    if (!update || typeof update.update_id !== "number") {
      return new Response("OK", { status: 200 });
    }

    // Deduplicate in-flight updates within this worker instance.
    dedupeUpdate(update.update_id);

    ctx.waitUntil(handleUpdate(update, env));
    return new Response("OK", { status: 200 });
  },
};

async function handleUpdate(update: TelegramUpdate, env: Env) {
  const message = update.message ?? update.edited_message;
  if (!message) return;

  const text = message.text ?? message.caption ?? "";
  const isRelay = hasCommand(text, "/relay");
  const isForward = hasCommand(text, "/forward");

  if (!isRelay && !isForward) {
    return;
  }

  if (isRelay) {
    await handleRelay(message, env);
    return;
  }

  if (isForward) {
    await handleForward(message, env);
  }
}

function hasCommand(text: string, command: string) {
  const normalized = text.trim().toLowerCase();
  return normalized.split(/\s+/).some((part) => part === command);
}

function extractHashtags(text: string): string[] {
  const hashtags = Array.from(text.matchAll(/#[\p{L}0-9_]+/giu)).map((m) => m[0].toLowerCase());
  return [...new Set(hashtags)];
}

function getTargetChatIdsFromText(text: string): string[] {
  const tags = extractHashtags(text);
  const out = tags
    .map((tag) => HASHTAG_MAP[tag])
    .filter((id): id is string => typeof id === "string" && id.trim().length > 0);
  return [...new Set(out)];
}

async function handleRelay(message: TelegramMessage, env: Env) {
  const text = message.text ?? message.caption ?? "";
  const targetChatIds = getTargetChatIdsFromText(text);
  if (targetChatIds.length === 0) {
    return;
  }

  const mediaGroupId = message.media_group_id;
  if (mediaGroupId) {
    bufferAlbum(message, targetChatIds, env);
    return;
  }

  await Promise.all(
    targetChatIds.map((targetChatId) =>
      copyMessage(env, targetChatId, String(message.chat.id), message.message_id)
    )
  );
}

async function handleForward(message: TelegramMessage, env: Env) {
  const reply = message.reply_to_message;
  if (!reply) {
    await sendMessage(env, message.chat.id, "Please reply to the message you want to forward.");
    return;
  }

  const text = message.text ?? message.caption ?? "";
  const targetChatIds = getTargetChatIdsFromText(text);
  if (targetChatIds.length === 0) {
    return;
  }

  const mediaGroupId = reply.media_group_id;
  if (mediaGroupId) {
    // Best-effort album behavior: if we have cached album content, send it;
    // otherwise send this single message.
    bufferAlbum(reply, targetChatIds, env);
    return;
  }

  await Promise.all(
    targetChatIds.map((targetChatId) =>
      copyMessage(env, targetChatId, String(reply.chat.id), reply.message_id)
    )
  );
}

function bufferAlbum(message: TelegramMessage, targetChatIds: string[], env: Env) {
  const key = `${message.chat.id}:${message.media_group_id}`;
  const entry = albumCache.get(key) ?? {
    targets: new Set<string>(),
    messages: [],
  };

  targetChatIds.forEach((id) => entry.targets.add(id));

  // Replace any earlier message with same message_id to keep latest copy.
  entry.messages = entry.messages.filter((m) => m.message_id !== message.message_id);
  entry.messages.push(message);

  if (entry.timer) {
    clearTimeout(entry.timer);
  }

  // Wait briefly for the rest of the album to arrive. Telegram often delivers album parts
  // in rapid succession. If we send too early, we may miss other photos/videos.
  entry.timer = (globalThis as any).setTimeout(() => {
    flushAlbum(key, env).catch((err) => console.error("Album flush failed", err));
  }, 1600);

  albumCache.set(key, entry);
}

async function flushAlbum(key: string, env: Env) {
  const entry = albumCache.get(key);
  if (!entry) return;

  albumCache.delete(key);
  if (entry.timer) {
    clearTimeout(entry.timer);
  }

  if (entry.targets.size === 0 || entry.messages.length === 0) {
    return;
  }

  // Order by message_id so the album is in the original order.
  const messages = entry.messages.sort((a, b) => a.message_id - b.message_id);

  const firstCaption = messages.find((m) => (m.caption ?? "").trim().length > 0)?.caption ?? "";

  const media = messages.map((msg, index) => {
    const base: any = {
      media: getMediaFileId(msg),
      type: getMediaType(msg),
    };

    if (index === 0 && firstCaption) {
      base.caption = firstCaption;
    }

    return base;
  });

  // If we couldn't detect usable media for any message, abort.
  if (media.some((m) => !m.media || !m.type)) {
    return;
  }

  await Promise.all(
    Array.from(entry.targets).map((targetChatId) => sendMediaGroup(env, targetChatId, media))
  );
}

function getMediaFileId(msg: TelegramMessage): string | undefined {
  // Prefer photo (last size is highest resolution)
  if (Array.isArray(msg.photo) && msg.photo.length > 0) {
    return msg.photo[msg.photo.length - 1].file_id;
  }

  if (msg.video?.file_id) return msg.video.file_id;
  if (msg.document?.file_id) return msg.document.file_id;
  if (msg.animation?.file_id) return msg.animation.file_id;

  return undefined;
}

function getMediaType(msg: TelegramMessage): "photo" | "video" | "document" | undefined {
  if (Array.isArray(msg.photo) && msg.photo.length > 0) return "photo";
  if (msg.video) return "video";
  if (msg.document) return "document";
  if (msg.animation) return "document"; // animations are sent as documents in media groups
  return undefined;
}

async function copyMessage(env: Env, targetChatId: string, fromChatId: string, messageId: number) {
  const token = env.BOT_TOKEN;
  if (!token) return;

  const url = `https://api.telegram.org/bot${token}/copyMessage`;
  await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: targetChatId,
      from_chat_id: fromChatId,
      message_id: messageId,
      disable_notification: true,
    }),
  });
}

async function sendMediaGroup(env: Env, targetChatId: string, media: Array<any>) {
  const token = env.BOT_TOKEN;
  if (!token) return;

  const url = `https://api.telegram.org/bot${token}/sendMediaGroup`;
  await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: targetChatId,
      media,
      disable_notification: true,
    }),
  });
}

async function sendMessage(env: Env, chatId: number, text: string) {
  const token = env.BOT_TOKEN;
  if (!token) return;

  const url = `https://api.telegram.org/bot${token}/sendMessage`;
  await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, disable_notification: true }),
  });
}

function dedupeUpdate(updateId: number) {
  const now = Date.now();
  seenUpdates.set(updateId, now);

  // Prune old entries occasionally.
  if (seenUpdates.size > 500) {
    for (const [id, ts] of seenUpdates.entries()) {
      if (now - ts > SEEN_TTL_MS) {
        seenUpdates.delete(id);
      }
    }
  }
}
