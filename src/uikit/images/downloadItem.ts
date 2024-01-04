import { DownloadedItem } from './DownloadedItem';
import { PlaylistItem } from './Playlist';

/**
 * Downloads the given playlist item. Returns a rejected promise if
 * there is a network error or the server returns a non-200 status code.
 *
 * @param item The item to download
 * @param jwt The JWT to use to authenticate the request
 * @param opts.abortSignal An abort signal to abort the request before it
 *   completes. Only available in some browsers.
 * @returns The downloaded item
 */
export const downloadItem = async (
  item: PlaylistItem,
  jwt: string,
  opts?: { abortSignal?: AbortSignal }
): Promise<DownloadedItem> => {
  const response = await fetch(item.url, {
    headers: { Authorization: `bearer ${jwt}` },
    ...(opts?.abortSignal === undefined ? {} : { signal: opts.abortSignal }),
  });
  if (!response.ok) {
    throw response;
  }

  const blob = await response.blob();
  const url = URL.createObjectURL(blob);

  return {
    remoteUrl: item.url,
    localUrl: url,
    originalLocalUrl: url,
  };
};
