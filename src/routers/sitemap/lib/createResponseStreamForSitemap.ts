import { Readable } from 'stream';
import { Sitemap } from './Sitemap';

/**
 * Creates a response stream which renders the given sitemap in XML format
 * using the given character set.
 *
 * @param sitemap The sitemap to render
 * @param charset The character set to use. The result is currently always
 *   ascii, but this may change in the future.
 */
export const createResponseStreamForSitemap = (
  rootFrontendUrl: string,
  sitemap: Sitemap,
  charset: 'utf-8' | 'ascii'
): Readable => {
  const myGenerator = createGeneratorForSitemap(rootFrontendUrl, sitemap, charset);
  const stream = new Readable({
    read: () => {
      const result = myGenerator.next();
      if (result.done) {
        stream.push(null);
      } else {
        stream.push(Buffer.from(result.value, charset));
      }
    },
  });
  return stream;
};

const createGeneratorForSitemap = function* (
  rootFrontendUrl: string,
  sitemap: Sitemap,
  charset: 'utf-8' | 'ascii'
) {
  yield `<?xml version="1.0" encoding="${charset.toLocaleUpperCase()}"?>\n`;
  yield '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n';
  for (const entry of sitemap.entries) {
    yield '  <url>\n';
    yield `    <loc>${rootFrontendUrl}${entry.path}</loc>\n`;
    yield '  </url>\n';
  }
  yield '</urlset>\n';
};
