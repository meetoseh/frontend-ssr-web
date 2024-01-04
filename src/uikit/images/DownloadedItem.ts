/**
 * The information we need about an item that we have successfully
 * downloaded.
 */
export type DownloadedItem = {
  /**
   * A URI where the resource can be accessed locally (either memory
   * or disk)
   */
  localUrl: string;

  /**
   * If the local version is actually a cropped version of the remote version,
   * this is the local url where the original remote version can be accessed
   * in case we need to crop it differently.
   */
  originalLocalUrl: string;

  /**
   * The URI we fetched the resource from, primarily for avoiding
   * refetching the same resource
   */
  remoteUrl: string;

  /**
   * If the local version is actually a cropped version of the remote version,
   * this is the size we cropped the remote version to. We always crop to the
   * center and this is never greater than the remote version on either axis.
   */
  croppedTo?: { width: number; height: number };
};

export const downloadedItemsEqual = (
  a: DownloadedItem | null,
  b: DownloadedItem | null
): boolean => {
  if (a === b) {
    return true;
  }

  if (a === null || b === null) {
    return false;
  }

  return (
    a.localUrl === b.localUrl &&
    a.originalLocalUrl === b.originalLocalUrl &&
    a.remoteUrl === b.remoteUrl &&
    (a.croppedTo === b.croppedTo ||
      (a.croppedTo !== undefined &&
        b.croppedTo !== undefined &&
        a.croppedTo.width === b.croppedTo.width &&
        a.croppedTo.height === b.croppedTo.height))
  );
};
