import { ReactElement } from 'react';
import ReactDOMServer from 'react-dom/server';
import crypto from 'crypto';

/**
 * Hashes the given element in the appropriate way for
 * `significantContentSHA512` in `SitemapEntry`.
 */
export const hashElementForSitemap = (element: ReactElement): string => {
  const rendered = ReactDOMServer.renderToString(element);
  const hasher = crypto.createHash('sha512');
  hasher.update(rendered, 'utf-8');
  return hasher.digest('base64url');
};
