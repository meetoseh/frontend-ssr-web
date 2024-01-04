import { USES_WEBP } from './usesWebp';

const cropImageUnsafe = async (
  src: string,
  cropTo: { width: number; height: number },
  _cacheableIdentifier: string
): Promise<string> => {
  const usesWebp = await USES_WEBP;
  const format = usesWebp ? 'image/webp' : 'image/png';
  return new Promise<string>((resolve, reject) => {
    const img = new Image();
    img.onerror = reject;
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = cropTo.width;
      canvas.height = cropTo.height;
      const ctx = canvas.getContext('2d');
      if (ctx === null) {
        reject(new Error('Could not get 2d context from canvas'));
        return;
      }
      const imgWidth = img.naturalWidth;
      const imgHeight = img.naturalHeight;
      const leftCrop = Math.floor((imgWidth - cropTo.width) / 2);
      const topCrop = Math.floor((imgHeight - cropTo.height) / 2);

      ctx.drawImage(
        img,
        leftCrop,
        topCrop,
        cropTo.width,
        cropTo.height,
        0,
        0,
        cropTo.width,
        cropTo.height
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
    img.src = src;
  });
};

/**
 * Crops the image at the given url to the given size, returning
 * a promise which resolves to a url where the cropped image can
 * be downloaded.
 *
 * Unlike cropImageUnsafe, which shouldn't be used directly, if
 * something goes wrong this returns the original image url.
 *
 * @param src The url of the image to crop
 * @param cropTo The size to crop the image to
 * @param cacheableIdentifier A unique string which identifies the source
 *   image and the crop settings. For the web this is unused, but for
 *   the apps it's used as a filename.
 */
export const cropImage = async (
  src: string,
  cropTo: { width: number; height: number },
  cacheableIdentifier: string
): Promise<string> => {
  try {
    return await cropImageUnsafe(src, cropTo, cacheableIdentifier);
  } catch (e) {
    console.error('Error cropping image', e);
    return src;
  }
};
