import { USES_WEBP } from './usesWebp';

const scaleImageUnsafe = async (
  src: string,
  srcSize: { width: number; height: number },
  scaleTo: { width: number; height: number },
  cacheableIdentifier: string,
  isVector: boolean
): Promise<string> => {
  const usesWebp = await USES_WEBP;
  const format = usesWebp ? 'image/webp' : 'image/png';
  return new Promise<string>((resolve, reject) => {
    const img = new Image();
    img.onerror = reject;
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = scaleTo.width;
      canvas.height = scaleTo.height;
      const ctx = canvas.getContext('2d');
      if (ctx === null) {
        reject(new Error('Could not get 2d context from canvas'));
        return;
      }

      ctx.drawImage(
        img,
        0,
        0,
        img.naturalWidth,
        img.naturalHeight,
        0,
        0,
        scaleTo.width,
        scaleTo.height
      );
      canvas.toBlob(
        (blob) => {
          if (blob === null) {
            reject(new Error('Could not convert canvas to blob'));
            return;
          }
          resolve(URL.createObjectURL(blob));
        },
        format,
        1
      );
    };
    if (isVector) {
      const scaleFactor = Math.max(scaleTo.width / srcSize.width, scaleTo.height / srcSize.height);
      img.width = Math.ceil(srcSize.width * scaleFactor);
      img.height = Math.ceil(srcSize.height * scaleFactor);
    }
    img.src = src;
  });
};

/**
 * Scales the image at the given url to the given size, returning
 * a promise which resolves to a url where the cropped image can
 * be downloaded.
 *
 * Unlike scaleImageUnsafe, which shouldn't be used directly, if
 * something goes wrong this returns the original image url.
 *
 * @param src The url of the image to rescale without cropping, as if
 *   by `object-fit: fill`
 * @param srcSize The expected natural size of the image, primarily for vector
 *   images
 * @param scaleTo The size to resize the image to
 * @param cacheableIdentifier A unique string which identifies the source
 *   image and the crop settings. For the web this is unused, but for
 *   the apps it's used as a filename.
 * @param isVector true if the src points to a vector image, i.e., we can
 *   scale it arbitrarily without loss of quality. false if the src points
 *   to a raster image, i.e., we can't scale it arbitrarily without loss
 *   of quality.
 */
export const scaleImage = async (
  src: string,
  srcSize: { width: number; height: number },
  scaleTo: { width: number; height: number },
  cacheableIdentifier: string,
  isVector: boolean
): Promise<string> => {
  try {
    return await scaleImageUnsafe(src, srcSize, scaleTo, cacheableIdentifier, isVector);
  } catch (e) {
    console.error('Error scaling image', e);
    return src;
  }
};
