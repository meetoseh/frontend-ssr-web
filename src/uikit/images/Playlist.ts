import { CrudFetcherKeyMap, convertUsingKeymap } from '../crud/CrudFetcher';
import { HTTP_API_URL } from '../ApiConstants';
import { compareSizes } from './compareSizes';

/**
 * An item within a playlist
 */
export type PlaylistItem = {
  /**
   * URL where the item can be accessed
   */
  url: string;
  /**
   * The format of the item, e.g., 'jpeg'
   */
  format: string;
  /**
   * The width of the item in pixels
   */
  width: number;
  /**
   * The height of the item in pixels
   */
  height: number;
  /**
   * The size of the item in bytes
   */
  sizeBytes: number;
};

export const playlistItemKeymap: CrudFetcherKeyMap<PlaylistItem> = {
  size_bytes: 'sizeBytes',
};

export const playlistItemsEqual = (a: PlaylistItem | null, b: PlaylistItem | null): boolean => {
  if (a === b) {
    return true;
  }

  if (a === null || b === null) {
    return false;
  }

  return (
    a.url === b.url &&
    a.format === b.format &&
    a.width === b.width &&
    a.height === b.height &&
    a.sizeBytes === b.sizeBytes
  );
};

export type PlaylistItemWithJWTAndCropSize = {
  item: PlaylistItem;
  jwt: string;
  cropTo?: { width: number; height: number };
};

/**
 * Determines if two crop sizes are equal. If either is undefined, they are
 * considered equal if the other is undefined.
 *
 * @param a The first crop size
 * @param b The second crop size
 * @returns True if the crop sizes are equal, false otherwise
 */
export const cropToEqual = (
  a?: { width: number; height: number },
  b?: { width: number; height: number }
): boolean => {
  if (a === b) {
    return true;
  }

  if (a === undefined || b === undefined) {
    return false;
  }

  return a.width === b.width && a.height === b.height;
};

export type Playlist = {
  /**
   * The uid of the image file this playlist is for, so we don't refetch the image
   * just because the jwt changed
   */
  uid: string;

  /**
   * The items in the playlist, broken out by format, where
   * the lists are sorted by size, ascending.
   */
  items: { [format: string]: PlaylistItem[] };
};

export const playlistKeymap: CrudFetcherKeyMap<Playlist> = {
  items: (_, v: { [format: string]: any[] }) => ({
    key: 'items',
    value: Object.fromEntries(
      Object.entries(v).map(([key, val]) => [
        key,
        val.map((v) => convertUsingKeymap(v, playlistItemKeymap)),
      ])
    ),
  }),
};

export const playlistsEqual = (a: Playlist | null, b: Playlist | null): boolean => {
  if (a === b) {
    return true;
  }

  if (a === null || b === null) {
    return false;
  }

  if (a.uid !== b.uid) {
    return false;
  }

  const aKeys = Object.keys(a.items);
  const bKeys = Object.keys(b.items);

  if (aKeys.length !== bKeys.length) {
    return false;
  }

  for (const key of aKeys) {
    if (!bKeys.includes(key)) {
      return false;
    }

    const aItems = a.items[key];
    const bItems = b.items[key];

    if (aItems.length !== bItems.length) {
      return false;
    }

    for (let i = 0; i < aItems.length; i++) {
      if (!playlistItemsEqual(aItems[i], bItems[i])) {
        return false;
      }
    }
  }

  return true;
};

export type PlaylistWithJWT = { playlist: Playlist; jwt: string };

/**
 * Fetches the playlist information for a given private playlist. Returns
 * a rejected promise if there is a network error or the server returns
 * a non-200 status code.
 *
 * @param uid The uid of the playlist to fetch
 * @param jwt The JWT to use to authenticate the request
 * @param abortSignal An optional AbortSignal to abort the request
 * @returns The playlist information
 */
export const fetchPrivatePlaylist = async (
  uid: string,
  jwt: string,
  abortSignal?: AbortSignal | null
): Promise<Playlist> => {
  const response = await fetch(`${HTTP_API_URL}/api/1/image_files/playlist/${uid}`, {
    method: 'GET',
    headers: { authorization: `bearer ${jwt}` },
    ...(abortSignal ? { signal: abortSignal } : {}),
  });

  if (!response.ok) {
    throw response;
  }

  const data = await response.json();
  return convertUsingKeymap(data, playlistKeymap);
};

/**
 * Fetches the playlist information for a given public playlist. Returns
 * a rejected promise if there is a network error or the server returns
 * a non-200 status code.
 *
 * Public playlists still require a jwt to access the individual exports,
 * but the response includes the jwt to use in the header. Thus, this
 * also returns the jwt to use for fetching the individual exports.
 *
 * @param uid The uid of the playlist to fetch
 * @param abortSignal An optional AbortSignal to abort the request
 * @returns The playlist information and the jwt to use to fetch the individual exports
 */
export const fetchPublicPlaylist = async (
  uid: string,
  abortSignal?: AbortSignal | null
): Promise<{ playlist: Playlist; jwt: string }> => {
  const response = await fetch(`${HTTP_API_URL}/api/1/image_files/playlist/${uid}?public=1`, {
    method: 'GET',
    ...(abortSignal ? { signal: abortSignal } : {}),
  });

  if (!response.ok) {
    throw response;
  }

  const jwt = response.headers.get('x-image-file-jwt');
  if (jwt === null) {
    throw new Error('Public playlist response did not include JWT in x-image-file-jwt header');
  }

  const data = await response.json();
  const playlist = convertUsingKeymap(data, playlistKeymap);
  return { playlist, jwt };
};

/**
 * Selects the format available in the given playlist by preference
 * based on the actual width and height we want to display the final
 * exported image at.
 *
 * @param playlist The playlist to select from
 * @param usesWebp Whether the device supports webp
 * @param want The width and height of the image we want to display
 * @returns The format to use
 */
export function selectFormat<T extends Playlist>(
  playlist: T,
  usesWebp: boolean,
  want: { width: number; height: number }
): string & keyof T['items'] {
  const area = want.width * want.height;

  if (usesWebp && playlist.items.webp) {
    return 'webp';
  }

  if (area <= 200 * 200 && playlist.items.png) {
    return 'png';
  }

  if (playlist.items.jpeg) {
    return 'jpeg';
  }

  return 'png';
}

/**
 * Selects the best item within the given list of options, given
 * that we want to render it at the given width and height.
 *
 * @param items The list of items to choose from, must be non-empty
 */
const selectBestItemFromItems = (
  items: PlaylistItem[],
  want: { width: number; height: number }
): PlaylistItem => {
  if (items.length === 0) {
    throw new Error('Cannot select best item from empty list');
  }

  let best = items[0];
  for (let i = 1; i < items.length; i++) {
    if (compareSizes(want, items[i], best) < 0) {
      best = items[i];
    }
  }
  return best;
};

/**
 * Selects the best item from the given playlist, given that we want
 * to render it at the given width and height and if the device supports
 * webp.
 *
 * @param playlist The playlist to select from
 * @param usesWebp Whether the device supports webp
 * @param want The width and height of the image we want to display
 * @returns The best item to use
 */
const selectBestItem = (
  playlist: Playlist,
  usesWebp: boolean,
  want: { width: number; height: number }
): PlaylistItem => {
  const format = selectFormat(playlist, usesWebp, want);
  return selectBestItemFromItems(playlist.items[format], want);
};

/**
 * Determines the best size to use for the given playlist when we want
 * to render an image at the given logical size and pixel ratio,
 * then uses that to determine the best item to use. This is a pixel-ratio
 * aware variant of selectBestItem, as it's often better to downgrade pixel
 * ratios rather than using an image which is too small.
 */
export const selectBestItemUsingPixelRatio = ({
  playlist,
  usesWebp,
  logical,
  preferredPixelRatio,
}: {
  playlist: Playlist;
  usesWebp: boolean;
  logical: { width: number; height: number };
  preferredPixelRatio: number;
}): { item: PlaylistItem; cropTo?: { width: number; height: number } } => {
  let pixelRatio = preferredPixelRatio;
  while (true) {
    const want = { width: logical.width * pixelRatio, height: logical.height * pixelRatio };
    const item = selectBestItem(playlist, usesWebp, want);

    const satisfactorilyLarge = item.width >= want.width && item.height >= want.height;
    if (pixelRatio === preferredPixelRatio && satisfactorilyLarge) {
      if (item.width === want.width && item.height === want.height) {
        return { item };
      }
      return { item, cropTo: { width: want.width, height: want.height } };
    }
    if (satisfactorilyLarge) {
      return {
        item,
        cropTo: { width: want.width, height: want.height },
      };
    }
    if (pixelRatio <= 1) {
      return { item };
    }
    pixelRatio = Math.max(1, pixelRatio - 1);
  }
};
