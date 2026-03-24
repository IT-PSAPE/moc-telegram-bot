export type RuntimeConfig = {
  botToken: string;
  hashtagMap: Record<string, string>;
};

export type TelegramUpdate = {
  update_id: number;
  message?: TelegramMessage;
  edited_message?: TelegramMessage;
};

export type TelegramMessage = {
  message_id: number;
  date: number;
  chat: {
    id: number;
    type: string;
  };
  from?: {
    id: number;
    is_bot?: boolean;
    first_name?: string;
    username?: string;
  };
  text?: string;
  caption?: string;
  media_group_id?: string;
  reply_to_message?: TelegramMessage;
};
