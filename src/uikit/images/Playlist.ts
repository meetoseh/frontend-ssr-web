import { HTTP_API_URL } from '../ApiConstants';
import { CrudFetcherKeyMap, convertUsingKeymap } from '../crud/CrudFetcher';
import { LogicalSize } from './LogicalSize';
import { compareSizes, compareVectorSizes, reduceImageSizeExactly } from './compareSizes';

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
  /**
   * The thumbhash of the image, base64url encoded.
   * See https://evanw.github.io/thumbhash/
   */
  thumbhash: string;
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
  want: LogicalSize
): string & keyof T['items'] {
  if (usesWebp && playlist.items.webp) {
    return 'webp';
  }

  const area = (want.width ?? want.height) * (want.height ?? want.width);

  if (area <= 200 * 200 && playlist.items.png) {
    return 'png';
  }

  if (playlist.items.jpeg) {
    return 'jpeg';
  }

  return 'png';
}

/**
 * Determines if two aspect ratios are approximately equal. This is important
 * over exact aspect ratio comparisons, since the true original aspect ratio was
 * potentially lost when the image was exported, and larger resolutions might have
 * resulted in better approximations of the true original aspect ratio than would
 * be possible to represent using integers at the smaller resolutions. In other
 * words, 2x of 100x50 may sometimes be 200x101, rather than 200x100, if the true
 * original resolution is closer to 200x101 than 2x1, but closer to 2x1 than 100x51
 */
const areAspectRatiosApproximatelyEqual = (
  a: { width: number; height: number },
  b: { width: number; height: number }
): boolean => {
  if (a.width === b.width && a.height === b.height) {
    return true;
  }

  if (a.height === 0) {
    return b.height === 0;
  }
  if (b.height === 0) {
    return false;
  }
  if (a.width === 0) {
    return b.width === 0;
  }
  if (b.width === 0) {
    return false;
  }

  const widthOverHeightA = a.width / a.height;
  const widthOverHeightB = b.width / b.height;
  const relativeDifferenceWoH =
    Math.abs(widthOverHeightA - widthOverHeightB) / Math.max(widthOverHeightA, widthOverHeightB);
  if (relativeDifferenceWoH < 0.05) {
    return true;
  }

  const heightOverWidthA = a.height / a.width;
  const heightOverWidthB = b.height / b.width;
  const relativeDifferenceHoW =
    Math.abs(heightOverWidthA - heightOverWidthB) / Math.max(heightOverWidthA, heightOverWidthB);
  return relativeDifferenceHoW < 0.05;
};

/**
 * Selects the best item within the given list of options, given
 * that we want to render it at the given width and height. This
 * implicitly assumes rasterized items, and thus the comparison
 * is inappropriate for vector items.
 *
 * @param items The list of items to choose from, must be non-empty
 * @param want The width and height of the image we want to display
 * @returns The best item to use
 */
const selectBestItemFromItems = (items: PlaylistItem[], want: LogicalSize): PlaylistItem => {
  if (items.length === 0) {
    throw new Error('Cannot select best item from empty list');
  }

  if (want.width !== null && want.height !== null) {
    let best = items[0];
    for (let i = 1; i < items.length; i++) {
      if (compareSizes(want, items[i], best) < 0) {
        best = items[i];
      }
    }
    return best;
  }

  let bestAspectRatio: { width: number; height: number } = reduceImageSizeExactly(items[0]);
  let bestAtBestAspectRatio = items[0];

  const compareSizeAtEqualAR =
    want.width === null
      ? (a: PlaylistItem, b: PlaylistItem) => {
          const usefulA = Math.min(a.height, want.height);
          const usefulB = Math.min(b.height, want.height);
          if (usefulA !== usefulB) {
            return usefulB - usefulA;
          }
          return a.height - b.height;
        }
      : (a: PlaylistItem, b: PlaylistItem) => {
          const usefulA = Math.min(a.width, want.width);
          const usefulB = Math.min(b.width, want.width);
          if (usefulA !== usefulB) {
            return usefulB - usefulA;
          }
          return a.width - b.width;
        };

  for (let i = 1; i < items.length; i++) {
    const aspectRatio = reduceImageSizeExactly(items[i]);
    if (!areAspectRatiosApproximatelyEqual(bestAspectRatio, aspectRatio)) {
      const compareResult = want.compareAspectRatios(bestAspectRatio, aspectRatio);

      if (compareResult < 0) {
        // current best is strictly better
        continue;
      }

      if (compareResult > 0) {
        // current item is strictly better
        bestAspectRatio = aspectRatio;
        bestAtBestAspectRatio = items[i];
        continue;
      }
    }

    // aspect ratio comparison is a match
    if (compareSizeAtEqualAR(items[i], bestAtBestAspectRatio) < 0) {
      bestAtBestAspectRatio = items[i];
    }
  }

  return bestAtBestAspectRatio;
};

/**
 * Selects the best item within the given list of options, given
 * that we want to render it at the given width and height. This
 * assumes vector items by ignoring the absolute width and height
 * values and instead selecting based on the aspect ratio.
 *
 * @param items The list of items to choose from, must be non-empty
 * @param want The width and height of the image we want to display
 * @returns The best item to use
 */
const selectBestVectorItemFromItems = (items: PlaylistItem[], want: LogicalSize): PlaylistItem => {
  if (items.length === 0) {
    throw new Error('Cannot select best item from empty list');
  }

  let best = items[0];
  for (let i = 1; i < items.length; i++) {
    if (compareVectorSizes(want, items[i], best) < 0) {
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
const selectBestItem = (playlist: Playlist, usesWebp: boolean, want: LogicalSize): PlaylistItem => {
  const format = selectFormat(playlist, usesWebp, want);
  return selectBestItemFromItems(playlist.items[format], want);
};

const getScaledSize = (logical: LogicalSize, pixelRatio: number): LogicalSize => {
  if (logical.width === null) {
    return {
      width: null,
      height: logical.height * pixelRatio,
      compareAspectRatios: logical.compareAspectRatios,
    };
  } else if (logical.height === null) {
    return {
      width: logical.width * pixelRatio,
      height: null,
      compareAspectRatios: logical.compareAspectRatios,
    };
  }
  return { width: logical.width * pixelRatio, height: logical.height * pixelRatio };
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
  usesSvg,
  logical,
  preferredPixelRatio,
}: {
  playlist: Playlist;
  usesWebp: boolean;
  usesSvg: boolean;
  logical: LogicalSize;
  preferredPixelRatio: number;
}): { item: PlaylistItem; cropTo?: { width: number; height: number } } => {
  if (usesSvg && playlist.items.svg) {
    const bestVectorItem = selectBestVectorItemFromItems(playlist.items.svg, logical);
    const want = (() => {
      if (logical.width === null) {
        return {
          width:
            (bestVectorItem.width / bestVectorItem.height) * logical.height * preferredPixelRatio,
          height: logical.height * preferredPixelRatio,
        };
      }

      if (logical.height === null) {
        return {
          width: logical.width * preferredPixelRatio,
          height:
            (bestVectorItem.height / bestVectorItem.width) * logical.width * preferredPixelRatio,
        };
      }

      return {
        width: logical.width * preferredPixelRatio,
        height: logical.height * preferredPixelRatio,
      };
    })();
    const scaleFactorRequired = Math.max(
      want.width / bestVectorItem.width,
      want.height / bestVectorItem.height
    );
    const rasterizedSize = {
      width: scaleFactorRequired * bestVectorItem.width,
      height: scaleFactorRequired * bestVectorItem.height,
    };
    const adjustedItem = {
      ...bestVectorItem,
      width: rasterizedSize.width,
      height: rasterizedSize.height,
    };
    const threshold = 1 / preferredPixelRatio;
    if (
      Math.abs(adjustedItem.width - want.width) < threshold &&
      Math.abs(adjustedItem.height - want.height) < threshold
    ) {
      return { item: adjustedItem };
    }

    return {
      item: {
        ...adjustedItem,
        width: Math.ceil(adjustedItem.width * preferredPixelRatio) / preferredPixelRatio,
        height: Math.ceil(adjustedItem.height * preferredPixelRatio) / preferredPixelRatio,
      },
      cropTo: { width: want.width, height: want.height },
    };
  }

  let pixelRatio = preferredPixelRatio;
  while (true) {
    const want = getScaledSize(logical, pixelRatio);

    const item = selectBestItem(playlist, usesWebp, want);
    const itemWant =
      want.width === null
        ? { width: Math.round((item.width * want.height) / item.height), height: want.height }
        : want.height === null
          ? { width: want.width, height: Math.round((item.height * want.width) / item.width) }
          : want;

    const satisfactorilyLarge = item.width >= itemWant.width && item.height >= itemWant.height;
    if (pixelRatio === preferredPixelRatio && satisfactorilyLarge) {
      if (item.width === itemWant.width && item.height === itemWant.height) {
        return { item };
      }
      return { item, cropTo: itemWant };
    }
    if (satisfactorilyLarge) {
      return {
        item,
        cropTo: itemWant,
      };
    }
    if (pixelRatio <= 1) {
      return { item };
    }
    pixelRatio = Math.max(1, pixelRatio - 1);
  }
};
