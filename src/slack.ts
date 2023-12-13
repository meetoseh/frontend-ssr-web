export type SendMessageOptions = {
  /** the text for the notification, defaults to the message */
  preview?: string;
  /** whether the message is markdown or plaintext, defaults to true */
  markdown?: boolean;
};

const SLACK_CHANNELS = {
  'web-errors': 'SLACK_WEB_ERRORS_URL',
  ops: 'SLACK_OPS_URL',
  'oseh-bot': 'SLACK_OSEH_BOT_URL',
  'oseh-classes': 'SLACK_OSEH_CLASSES_URL',
};

/**
 * The slack channel names that we can send messaes to.
 */
export type SlackChannelId = keyof typeof SLACK_CHANNELS;

/**
 * Sends the given slack formatted block to the given slack url. This will
 * raise an error if we cannot connect to slack, but not based on a bad status
 * code.
 *
 * @param url the incoming webhook url
 * @param blocks see https://api.slack.com/messaging/webhooks#advanced_message_formatting
 * @param preview the text for the notification
 */
export const sendBlocks = async (url: string, blocks: object[], preview: string): Promise<void> => {
  await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=UTF-8' },
    body: JSON.stringify({
      text: preview,
      blocks,
    }),
  });
};

/**
 * Sends the given markdown (default) or plaintext to the given slack url
 *
 * @param url the incoming webhook url
 * @param message the markdown formatted message to send (or plaintext if markdown is false)
 * @param opts see SendMessageOptions
 */
export const sendMessage = (
  url: string,
  message: string,
  opts?: SendMessageOptions
): Promise<void> => {
  return sendBlocks(
    url,
    [
      {
        type: 'section',
        text: {
          type: opts?.markdown ?? true ? 'mrkdwn' : 'plain_text',
          text: message,
        },
      },
    ],
    opts?.preview ?? message
  );
};

/**
 * Sends the given blocks to the given channel, identified by its name
 *
 * @param channel the channel to send the message to
 * @param blocks see https://api.slack.com/messaging/webhooks#advanced_message_formatting
 * @param preview the text for the notification
 */
export const sendBlocksTo = (
  channel: SlackChannelId,
  blocks: object[],
  preview: string
): Promise<void> => {
  return sendBlocks(requireEnvVar(SLACK_CHANNELS[channel]), blocks, preview);
};

/**
 * Sends the given markdown text to the given channel, identified by its name
 *
 * @param channel the channel to send the message to
 * @param message the markdown formatted message to send
 * @param opts see SendMessageOptions
 */
export const sendMessageTo = (
  channel: SlackChannelId,
  message: string,
  opts?: SendMessageOptions
): Promise<void> => {
  return sendMessage(requireEnvVar(SLACK_CHANNELS[channel]), message, opts);
};

const requireEnvVar = (envName: string): string => {
  const url = process.env[envName];
  if (url === undefined) {
    throw new Error(`Missing environment variable ${envName}`);
  }
  return url;
};
