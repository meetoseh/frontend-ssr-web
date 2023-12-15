import { CancelablePromise } from './lib/CancelablePromise';
import { constructCancelablePromise } from './lib/CancelablePromiseConstructor';

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
 * @returns a cancelable promise that resolves when the fetch completes, using an abort signal
 *       to cancel the fetch if requested
 */
export const sendBlocksCancelable = (
  url: string,
  blocks: object[],
  preview: string
): CancelablePromise<void> => {
  return constructCancelablePromise({
    body: async (state, resolve, reject) => {
      const controller = new AbortController();
      const doAbort = () => controller.abort();
      state.cancelers.add(doAbort);
      if (state.finishing) {
        state.done = true;
        reject(new Error('canceled'));
        return;
      }

      try {
        await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json; charset=UTF-8' },
          body: JSON.stringify({
            text: preview,
            blocks,
          }),
          signal: controller.signal,
        });
        state.finishing = true;
        state.done = true;
        resolve();
      } catch (e) {
        state.finishing = true;
        state.done = true;
        reject(e);
      }
    },
  });
};

/**
 * Sends the given slack formatted block to the given slack url. This will
 * raise an error if we cannot connect to slack, but not based on a bad status
 * code. Sets a 20 second timeout, unlike sendBlocksCancelable, since this
 * masks the cancel() method.
 *
 * @param url the incoming webhook url
 * @param blocks see https://api.slack.com/messaging/webhooks#advanced_message_formatting
 * @param preview the text for the notification
 * @returns a promise that resolves when the message is sent, ignoring the returned status code
 */
export const sendBlocks = async (url: string, blocks: object[], preview: string): Promise<void> => {
  let timeoutResolved = false;
  let resolveTimeout = () => {
    timeoutResolved = true;
  };
  const timeout = new Promise<void>((resolve) => {
    resolveTimeout = resolve;

    if (timeoutResolved) {
      resolve();
      return;
    }

    setTimeout(resolve, 20000);
  });

  const send = sendBlocksCancelable(url, blocks, preview);
  try {
    await Promise.race([send, timeout]);
    if (!send.done()) {
      send.cancel();
      throw new Error('timeout');
    } else {
      resolveTimeout();
    }
  } catch (e) {
    send.cancel();
    resolveTimeout();
    throw e;
  }
};

// TODO: sendMessageCancelable

/**
 * Sends the given markdown (default) or plaintext to the given slack url
 *
 * @param url the incoming webhook url
 * @param message the markdown formatted message to send (or plaintext if markdown is false)
 * @param opts see SendMessageOptions
 * @returns a cancelable promise that resolves when the fetch completes, using an abort signal
 *     to cancel the fetch if requested
 */
export const sendMessageCancelable = (
  url: string,
  message: string,
  opts?: SendMessageOptions
): CancelablePromise<void> => {
  return sendBlocksCancelable(
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
 * Sends the given markdown (default) or plaintext to the given slack url. This is not
 * cancelable but includes a 20 second timeout.
 *
 * @param url the incoming webhook url
 * @param message the markdown formatted message to send (or plaintext if markdown is false)
 * @param opts see SendMessageOptions
 * @returns a promsie that resolves when the message is sent, ignoring the returned status code
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
 * Sends the given blocks to the given channel, identified by its name.
 *
 * @param channel the channel to send the message to
 * @param blocks see https://api.slack.com/messaging/webhooks#advanced_message_formatting
 * @param preview the text for the notification
 * @returns a cancelable promise that resolves when the fetch completes, using an abort signal
 *   to cancel the fetch if requested
 */
export const sendBlocksToCancelable = (
  channel: SlackChannelId,
  blocks: object[],
  preview: string
): CancelablePromise<void> => {
  return sendBlocksCancelable(requireEnvVar(SLACK_CHANNELS[channel]), blocks, preview);
};

/**
 * Sends the given blocks to the given channel, identified by its name, with a 20 second timeout
 *
 * @param channel the channel to send the message to
 * @param blocks see https://api.slack.com/messaging/webhooks#advanced_message_formatting
 * @param preview the text for the notification
 * @returns a promise that resolves when the message is sent, ignoring the returned status code
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
 * @returns a cancelable promise that resolves when the fetch completes, using an abort signal
 *   to cancel the fetch if requested
 */
export const sendMessageToCancelable = (
  channel: SlackChannelId,
  message: string,
  opts?: SendMessageOptions
): CancelablePromise<void> => {
  return sendMessageCancelable(requireEnvVar(SLACK_CHANNELS[channel]), message, opts);
};

/**
 * Sends the given markdown text to the given channel, identified by its name,
 * with a 20 second timeout
 *
 * @param channel the channel to send the message to
 * @param message the markdown formatted message to send
 * @param opts see SendMessageOptions
 * @returns a promise that resolves when the message is sent, ignoring the returned status code
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
