import { MutableRefObject, useCallback, useEffect, useMemo, useRef } from 'react';
import { Callbacks } from '../lib/Callbacks';
import { OsehImagePropsLoadable } from './OsehImageProps';
import { OsehImageState } from './OsehImageState';
import { LeastRecentlyUsedCache } from '../lib/LeastRecentlyUsedCache';
import {
  PlaylistItem,
  PlaylistWithJWT,
  fetchPrivatePlaylist,
  fetchPublicPlaylist,
  selectBestItemUsingPixelRatio,
} from './Playlist';
import { RefCountedDict } from '../lib/RefCountedDict';
import { CancelablePromise } from '../../lib/CancelablePromise';
import { DownloadedItem } from './DownloadedItem';
import { USES_WEBP } from './usesWebp';
import { downloadItem } from './downloadItem';
import { cropImage } from './cropImage';

/**
 * Describes a manually ref-counted reference to a given OsehImageState. While
 * the reference is held, the necessary server responses for generating the
 * state (e.g., the playlist response and the original image) are kept in an
 * accessible data store such that they can be reused if the same image is
 * requested again.
 *
 * Once the callee that requested the image state no longer needs it, they
 * should call the release() method to indicate that they no longer need the
 * image state. Once all references to the image state have been released, the
 * resources used to generate the image state are moved to a cache with a
 * limited size, in case they are needed again in the future.
 *
 * This object type is mutated by changing the state value and then calling
 * the stateChanged callbacks. Hence, it's not suitable for use as a hook
 * dependency. It can be converted into a hook dependency using the
 * `useOsehImageFromRequestedState` hook.
 */
export type OsehImageRequestedState = {
  /**
   * The current value of the state. Mutated only by the
   * `useOsehImageFromRequestedState` hook.
   */
  state: OsehImageState;
  /**
   * The callbacks invoked with the new state value whenever the state
   * value changes. Called only by the `useOsehImageFromRequestedState`
   */
  stateChanged: Callbacks<OsehImageState>;
  /**
   * Releases the reference to the image state. Once all references to
   * the image state have been released, the resources used to generate
   * the image state are moved to a cache with a limited size, in case
   * they are needed again in the future.
   */
  release: () => void;
};

type OsehImageRequest = {
  props: OsehImagePropsLoadable;
  requested: OsehImageRequestedState;
  released: boolean;
  releasedCallbacks: Callbacks<undefined>;
};

/**
 * Describes an object capable of loading images using a manually ref-counted
 * strategy.
 *
 * To get an image state, use `request`. Once you no longer need that image
 * state, call `release` on the returned object.
 */
export type OsehImageStateRequestHandler = {
  request: (props: OsehImagePropsLoadable) => OsehImageRequestedState;
};

/** A crop id is always a safe filename identifier */
type CropID = string;
/** Provides a valid filename unique to the given crop */
const getCropID = (url: string, width: number, height: number): CropID => {
  // if it includes query parameters, use fallback flow
  if (url.includes('?')) {
    return getFallbackCropID(url, width, height);
  }

  const lastSlashIdx = url.lastIndexOf('/');
  if (lastSlashIdx < 0) {
    return getFallbackCropID(url, width, height);
  }

  const lastPart = url.substring(lastSlashIdx + 1);
  if (!lastPart.startsWith('oseh_ife_')) {
    return getFallbackCropID(url, width, height);
  }

  const extensionIdx = lastPart.indexOf('.');
  const uid = extensionIdx < 0 ? lastPart : lastPart.substring(0, extensionIdx);

  return `${uid}-${width}-${height}`;
};

const getFallbackCropID = (url: string, width: number, height: number): CropID => {
  return `${encodeAsFilename(url)}-${width}-${height}`;
};

const encodeAsFilename = (s: string): string => {
  const parts = [];
  let includedUpToExcl = 0;

  const alnumRegex = /^[a-zA-Z0-9]$/;

  for (let i = 0; i < s.length; i++) {
    if (alnumRegex.test(s.charAt(i))) {
      continue;
    }

    if (i > includedUpToExcl) {
      parts.push(s.substring(includedUpToExcl, i));
      includedUpToExcl = i;
    }

    parts.push('x' + s.charCodeAt(i).toString(16));
    includedUpToExcl = i + 1;
  }

  if (includedUpToExcl < s.length) {
    parts.push(s.substring(includedUpToExcl));
  }

  return parts.join('');
};

/**
 * Provides a simple interface for fetching image states using a manual
 * ref-counting strategy, such that images are reused while they are
 * still in use.
 *
 * When they are no longer in use, we move the corresponding resources
 * to a cache with a limited size, in case they are used again in the
 * future.
 *
 * NOTE: This currently doesn't check for playlist JWT expiration when
 *   loading from caches. This feature was included, but removed as it
 *   yielded in locations where it was unsafe to do so. Need to add it
 *   back in.
 */
export const useOsehImageStateRequestHandler = ({
  playlistCacheSize = 16,
  imageCacheSize = 16,
  cropCacheSize = 16,
}: {
  playlistCacheSize?: number;
  imageCacheSize?: number;
  cropCacheSize?: number;
}): OsehImageStateRequestHandler => {
  const requestQueue = useRef<OsehImageRequest[]>([]);
  const requestQueuedCallbacks = useRef<Callbacks<undefined>>() as MutableRefObject<
    Callbacks<undefined>
  >;
  if (requestQueuedCallbacks.current === undefined) {
    requestQueuedCallbacks.current = new Callbacks<undefined>();
  }

  const request = useCallback((props: OsehImagePropsLoadable) => {
    let released = false;
    const releasedCallbacks = new Callbacks<undefined>();

    const requested = {
      state: {
        localUrl: null,
        displayWidth: props.displayWidth,
        displayHeight: props.displayHeight,
        alt: props.alt,
        loading: true,
        placeholderColor: props.placeholderColor,
      },
      stateChanged: new Callbacks<OsehImageState>(),
      release: () => {
        if (!released) {
          released = true;
          releasedCallbacks.call(undefined);
        }
      },
    };

    const request: OsehImageRequest = {
      props,
      requested,
      released,
      releasedCallbacks,
    };

    releasedCallbacks.add(() => {
      released = true;
      request.released = true;
    });

    requestQueue.current.push(request);
    requestQueuedCallbacks.current.call(undefined);
    return requested;
  }, []);

  useEffect(() => {
    /*
     * NOTE: promises, even when they are fulfilled, are not guarranteed to run
     * handlers immediately after thenning(). thus, to ensure cache consistency,
     * our cache will contain promises that are already fulfilled, rather than
     * the fulfilled values.
     */
    let active = true;
    const canceledCallbacks = new Callbacks<undefined>();
    const playlistsByImageFileUIDCache = new LeastRecentlyUsedCache<
      string,
      Promise<PlaylistWithJWT>
    >(playlistCacheSize);
    const playlistsByImageFileUID = new RefCountedDict<string, CancelablePromise<PlaylistWithJWT>>(
      (k, v) => {
        if (v.done()) {
          playlistsByImageFileUIDCache.add(k, v.promise);
        } else {
          v.cancel();
        }
      }
    );
    const imagesByURLCache = new LeastRecentlyUsedCache<string, Promise<DownloadedItem>>(
      imageCacheSize
    );
    const imagesByURL = new RefCountedDict<string, CancelablePromise<DownloadedItem>>((k, v) => {
      if (v.done()) {
        imagesByURLCache.add(k, v.promise);
      } else {
        v.cancel();
      }
    });
    const cropsByCropIDCache = new LeastRecentlyUsedCache<CropID, Promise<DownloadedItem>>(
      cropCacheSize
    );
    const cropsByCropID = new RefCountedDict<CropID, CancelablePromise<DownloadedItem>>((k, v) => {
      if (v.done()) {
        cropsByCropIDCache.add(k, v.promise);
      } else {
        v.cancel();
      }
    });

    handleQueue();
    requestQueuedCallbacks.current.add(handleQueue);
    return () => {
      if (active) {
        active = false;
        requestQueuedCallbacks.current.remove(handleQueue);
        canceledCallbacks.call(undefined);
        if (playlistsByImageFileUID.size !== 0) {
          throw new Error('failed to cleanup playlistsByImageFileUID');
        }
        if (imagesByURL.size !== 0) {
          throw new Error('failed to cleanup imagesByURL');
        }
        if (cropsByCropID.size !== 0) {
          throw new Error('failed to cleanup cropsByCropID');
        }
      }
    };

    async function handleQueue() {
      const usesWebp = await USES_WEBP;

      while (active) {
        const item = requestQueue.current.shift();
        if (item === undefined) {
          break;
        }
        if (!item.released) {
          handleRequest(item, usesWebp);
        }
      }
    }

    async function handleRequest(req: OsehImageRequest, usesWebp: boolean) {
      let requeued = false;
      const requeue = () => {
        if (!req.released && !requeued) {
          requeued = true;
          requestQueue.current.push(req);
          requestQueuedCallbacks.current.call(undefined);
          canceledCallbacks.remove(requeue);
        }
      };
      if (!active) {
        requeue();
        return;
      }
      canceledCallbacks.add(requeue);

      const handleError = (e: any) => {
        if (!active || req.released) {
          return;
        }

        console.error('error while loading image: ', req.props, '\n\nerror: ', e);
        req.released = true;
        req.releasedCallbacks.call(undefined);
      };

      const playlistPromise = getPlaylist(req.props);
      let playlistReleased = false;
      const releasePlaylist = () => {
        if (!playlistReleased) {
          playlistReleased = true;
          req.releasedCallbacks.remove(releasePlaylist);
          canceledCallbacks.remove(releasePlaylist);
          playlistsByImageFileUID.reduceRefCount(req.props.uid);
        }
      };
      req.releasedCallbacks.add(releasePlaylist);
      canceledCallbacks.add(releasePlaylist);
      let playlist: PlaylistWithJWT;
      try {
        playlist = await playlistPromise;
      } catch (e) {
        handleError(e);
        return;
      }
      if (!active || req.released) {
        return;
      }

      const bestItem = selectBestItemUsingPixelRatio({
        playlist: playlist.playlist,
        usesWebp,
        logical: { width: req.props.displayWidth, height: req.props.displayHeight },
        preferredPixelRatio: devicePixelRatio,
      });

      let bestItemReleased = false;
      const releaseItem = () => {
        if (!bestItemReleased) {
          bestItemReleased = true;
          req.releasedCallbacks.remove(releaseItem);
          canceledCallbacks.remove(releaseItem);
          imagesByURL.reduceRefCount(bestItem.item.url);
        }
      };
      req.releasedCallbacks.add(releaseItem);
      canceledCallbacks.add(releaseItem);
      let item: DownloadedItem;
      try {
        item = await getPlaylistItem(bestItem.item, playlist.jwt);
      } catch (e) {
        handleError(e);
        return;
      }

      if (!active || req.released) {
        return;
      }

      if (bestItem.cropTo === undefined) {
        req.requested.state = {
          ...req.requested.state,
          localUrl: item.localUrl,
          loading: false,
        };
        req.requested.stateChanged.call(req.requested.state);
        return;
      }
      const cropID = getCropID(bestItem.item.url, bestItem.cropTo.width, bestItem.cropTo.height);

      let cropReleased = false;
      const releaseCrop = () => {
        if (!cropReleased) {
          cropReleased = true;
          req.releasedCallbacks.remove(releaseCrop);
          canceledCallbacks.remove(releaseCrop);
          cropsByCropID.reduceRefCount(cropID);
        }
      };
      req.releasedCallbacks.add(releaseCrop);
      canceledCallbacks.add(releaseCrop);
      let crop: DownloadedItem;
      try {
        crop = await getCrop(item, bestItem.cropTo, cropID);
      } catch (e) {
        handleError(e);
        return;
      }

      if (!active || req.released) {
        return;
      }

      req.requested.state = {
        ...req.requested.state,
        localUrl: crop.localUrl,
        loading: false,
      };
      req.requested.stateChanged.call(req.requested.state);
    }

    async function getPlaylist(props: OsehImagePropsLoadable): Promise<PlaylistWithJWT> {
      const reused = playlistsByImageFileUID.get(props.uid);
      const replacing = reused !== undefined;
      if (replacing) {
        // checking for jwt means yielding, and there is no safe way to yield here
        return reused.promise;
      }

      const cached = playlistsByImageFileUIDCache.get(props.uid);
      if (cached !== undefined) {
        playlistsByImageFileUIDCache.remove(props.uid);
        playlistsByImageFileUID.set(props.uid, {
          promise: cached,
          cancel: () => undefined,
          done: () => true,
        });
        return cached;
      }

      let done = false;
      let realCanceler = () => {
        done = true;
      };
      const playlistPromise: Promise<PlaylistWithJWT> = new Promise(async (resolve, reject) => {
        if (done) {
          reject('canceled');
          return;
        }

        const abortController: AbortController | null = window.AbortController
          ? new window.AbortController()
          : null;
        const abortSignal: AbortSignal | null = abortController ? abortController.signal : null;

        realCanceler = () => {
          if (done) {
            return;
          }

          done = true;
          if (abortController !== null) {
            abortController.abort();
          }
          reject('canceled');
        };

        let playlist: PlaylistWithJWT;
        try {
          if (props.isPublic || props.jwt === null) {
            playlist = await fetchPublicPlaylist(props.uid, abortSignal);
          } else {
            playlist = {
              playlist: await fetchPrivatePlaylist(props.uid, props.jwt, abortSignal),
              jwt: props.jwt,
            };
          }
        } catch (e) {
          if (done) {
            return;
          }
          done = true;
          reject(e);
          return;
        }
        if (done) {
          return;
        }
        done = true;
        resolve(playlist);
      });
      const cancelablePlaylistPromise: CancelablePromise<PlaylistWithJWT> = {
        promise: playlistPromise,
        cancel: () => realCanceler(),
        done: () => done,
      };
      if (replacing) {
        playlistsByImageFileUID.replace(props.uid, cancelablePlaylistPromise);
      } else {
        playlistsByImageFileUID.set(props.uid, cancelablePlaylistPromise);
      }
      return playlistPromise;
    }

    async function getPlaylistItem(item: PlaylistItem, jwt: string): Promise<DownloadedItem> {
      const reused = imagesByURL.get(item.url);
      if (reused !== undefined) {
        return reused.promise;
      }

      const cached = imagesByURLCache.get(item.url);
      if (cached !== undefined) {
        imagesByURLCache.remove(item.url);
        imagesByURL.set(item.url, {
          promise: cached,
          cancel: () => undefined,
          done: () => true,
        });
        return cached;
      }

      let done = false;
      let realCanceler = () => {
        done = true;
      };
      const imagePromise: Promise<DownloadedItem> = new Promise(async (resolve, reject) => {
        if (done) {
          reject('canceled');
          return;
        }

        const abortController: AbortController | null = window.AbortController
          ? new window.AbortController()
          : null;
        const abortSignal: AbortSignal | null = abortController ? abortController.signal : null;

        realCanceler = () => {
          if (done) {
            return;
          }

          done = true;
          if (abortController !== null) {
            abortController.abort();
          }
          reject('canceled');
        };

        let downloadedItem: DownloadedItem;
        try {
          downloadedItem = await downloadItem(item, jwt, { abortSignal: abortSignal ?? undefined });
        } catch (e) {
          if (done) {
            return;
          }
          done = true;
          reject(e);
          return;
        }

        if (done) {
          return;
        }

        done = true;
        resolve(downloadedItem);
      });

      const cancelableImagePromise: CancelablePromise<DownloadedItem> = {
        promise: imagePromise,
        cancel: () => realCanceler(),
        done: () => done,
      };
      imagesByURL.set(item.url, cancelableImagePromise);
      return imagePromise;
    }

    async function getCrop(
      downloaded: DownloadedItem,
      cropTo: { width: number; height: number },
      cropID: string
    ): Promise<DownloadedItem> {
      const reused = cropsByCropID.get(cropID);
      if (reused !== undefined) {
        return reused.promise;
      }

      const cached = cropsByCropIDCache.get(cropID);
      if (cached !== undefined) {
        cropsByCropIDCache.remove(cropID);
        cropsByCropID.set(cropID, {
          promise: cached,
          cancel: () => undefined,
          done: () => true,
        });
        return cached;
      }

      let done = false;
      const realCanceler = () => {
        done = true;
      };
      const cropPromise: Promise<DownloadedItem> = new Promise(async (resolve, reject) => {
        if (done) {
          reject('canceled');
          return;
        }

        const croppedUrl = await cropImage(downloaded.originalLocalUrl, cropTo, cropID);
        if (done) {
          reject('canceled');
          return;
        }

        const croppedItem: DownloadedItem = {
          ...downloaded,
          localUrl: croppedUrl,
          croppedTo: cropTo,
        };
        done = true;
        resolve(croppedItem);
      });

      const cancelableCropPromise: CancelablePromise<DownloadedItem> = {
        promise: cropPromise,
        cancel: () => realCanceler(),
        done: () => done,
      };

      cropsByCropID.set(cropID, cancelableCropPromise);
      return cropPromise;
    }
  }, [playlistCacheSize, imageCacheSize, cropCacheSize]);

  return useMemo(() => ({ request }), [request]);
};
