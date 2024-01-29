import { Fragment, ReactElement } from 'react';
import { OpenGraphMetaImage } from '../lib/OpenGraphMetaImage';

/**
 * Renders the Open Graph meta tags appropriate for the given images, in order.
 * This must go inside the <head> tag.
 */
export const OpenGraphMetaImages = ({ images }: { images: OpenGraphMetaImage[] }): ReactElement => {
  return (
    <>
      {images.map((image, i) => (
        <Fragment key={i}>
          <meta property="og:image" content={image.url} />
          <meta property="og:image:width" content={image.width.toString()} />
          <meta property="og:image:height" content={image.height.toString()} />
          <meta property="og:image:type" content={image.type} />
        </Fragment>
      ))}
    </>
  );
};
