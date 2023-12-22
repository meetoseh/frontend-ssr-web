import { Readable } from 'stream';
import { Sitemap, SitemapEntry } from './Sitemap';
import type { Itgs } from '../../../lib/Itgs';
import { colorNow } from '../../../logging';
import chalk from 'chalk';
import { randomBytes } from 'crypto';
import { RqliteParameter } from 'rqdb';
import { inspect } from 'util';

/**
 * Creates a response stream which renders the given sitemap in XML format
 * using the given character set.
 *
 * @param itgs integrations to (re)use
 * @param rootFrontendUrl The root frontend url to use for the sitemap, e.g.,
 *   https://oseh.io
 * @param sitemap The sitemap to render
 * @param format The format for the sitemap; xml is standard, but text is
 *   convenient for simpler parsing and faster generation
 * @param charset The character set to use. The result is currently always
 *   ascii, but this may change in the future.
 */
export const createResponseStreamForSitemap = (
  itgs: Itgs,
  rootFrontendUrl: string,
  sitemap: Sitemap,
  format: 'xml' | 'plain',
  charset: 'utf-8' | 'ascii'
): Readable => {
  const myGenerator =
    format === 'xml'
      ? createGeneratorForSitemapXML(itgs, rootFrontendUrl, sitemap, charset)
      : createGeneratorForSitemapPlain(rootFrontendUrl, sitemap);
  const stream = new Readable({
    read: async () => {
      const result = await myGenerator.next();
      if (result.done) {
        stream.push(null);
      } else {
        stream.push(Buffer.from(result.value, charset));
      }
    },
  });
  return stream;
};

const createGeneratorForSitemapXML = async function* (
  itgs: Itgs,
  rootFrontendUrl: string,
  sitemap: Sitemap,
  charset: 'utf-8' | 'ascii'
) {
  yield `<?xml version="1.0" encoding="${charset.toLocaleUpperCase()}"?>\n`;
  yield '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n';

  const conn = await itgs.conn();
  const cursor = conn.cursor('none');
  const batchSize = 100;
  const requestDate = new Date();

  for (let startIndex = 0; startIndex < sitemap.entries.length; startIndex += batchSize) {
    const endIndex = Math.min(startIndex + batchSize, sitemap.entries.length);
    const paths = sitemap.entries.slice(startIndex, endIndex).map((entry) => entry.path);
    const pathToEntry = new Map<string, SitemapEntry>();
    for (let i = startIndex; i < endIndex; i++) {
      pathToEntry.set(sitemap.entries[i].path, sitemap.entries[i]);
    }

    const response = await cursor.execute(
      'SELECT path, significant_content_sha512, updated_at FROM sitemap_entries ' +
        'WHERE path IN (?' +
        ',?'.repeat(paths.length - 1) +
        ')',
      paths
    );

    const foundPaths = new Map<string, Date>();
    const newPaths = new Set(paths);
    const updatedPaths = new Set<string>();

    for (const [path, sha512, updatedAtSeconds] of response.results ?? []) {
      const entry = pathToEntry.get(path);
      if (entry === undefined) {
        throw new Error(`query returned a path we did not ask for: ${path}`);
      }

      newPaths.delete(path);
      if (sha512 === entry.significantContentSHA512) {
        foundPaths.set(path, new Date(updatedAtSeconds * 1000));
      } else {
        updatedPaths.add(path);
      }
    }

    if (newPaths.size > 0) {
      console.info(
        `${colorNow()} ${chalk.green(newPaths.size.toString())} ${chalk.white(
          'new sitemap entries found:'
        )} ${chalk.gray(Array.from(newPaths).join(', '))}`
      );

      const nowSeconds = Date.now() / 1000;
      const response = await cursor.execute(
        'WITH batch(uid, path, sha512) AS (VALUES (?, ?, ?)' +
          ', (?, ?, ?)'.repeat(newPaths.size - 1) +
          ') ' +
          'INSERT INTO sitemap_entries (uid, path, significant_content_sha512, created_at, updated_at) ' +
          'SELECT batch.uid, batch.path, batch.sha512, ?, ? FROM batch ' +
          'WHERE NOT EXISTS (SELECT 1 FROM sitemap_entries WHERE sitemap_entries.path = batch.path)',
        Array.from(newPaths)
          .flatMap((path): RqliteParameter[] => [
            `oseh_sme_${randomBytes(16).toString('base64url')}`,
            path,
            pathToEntry.get(path)!.significantContentSHA512,
          ])
          .concat([nowSeconds, nowSeconds])
      );
      if (response.rowsAffected !== newPaths.size) {
        console.warn(
          `${colorNow()} ${chalk.yellow('Expected to insert')} ${chalk.yellowBright(
            newPaths.size.toString()
          )} ${chalk.yellow(`sitemap entries, but instead inserted`)} ${chalk.yellowBright(
            inspect(response.rowsAffected, { colors: false })
          )}`
        );
      }
    }

    if (updatedPaths.size > 0) {
      console.info(
        `${colorNow()} ${chalk.green(updatedPaths.size.toString())} ${chalk.white(
          'updated sitemap entries:'
        )} ${chalk.gray(Array.from(updatedPaths).join(', '))}`
      );

      const nowSeconds = Date.now() / 1000;
      const response = await cursor.execute(
        'WITH batch(path, sha512) AS (VALUES (?, ?)' +
          ', (?, ?)'.repeat(updatedPaths.size - 1) +
          ') ' +
          'UPDATE sitemap_entries SET significant_content_sha512 = batch.sha512, updated_at = ? ' +
          'FROM batch WHERE sitemap_entries.path = batch.path',
        Array.from(updatedPaths)
          .flatMap((path): RqliteParameter[] => [
            path,
            pathToEntry.get(path)!.significantContentSHA512,
          ])
          .concat([nowSeconds])
      );
      if (response.rowsAffected !== updatedPaths.size) {
        console.warn(
          `${colorNow()} ${chalk.yellow('Expected to update')} ${chalk.yellowBright(
            updatedPaths.size.toString()
          )} ${chalk.yellow(`sitemap entries, but instead updated`)} ${chalk.yellowBright(
            inspect(response.rowsAffected, { colors: false })
          )}`
        );
      }
    }

    for (let i = startIndex; i < endIndex; i++) {
      const entry = sitemap.entries[i];
      const lastModified = foundPaths.get(entry.path) ?? requestDate;
      const lastModifiedDate = `${lastModified
        .getUTCFullYear()
        .toString()
        .padStart(4, '0')}-${lastModified.getUTCMonth().toString().padStart(2, '0')}-${lastModified
        .getUTCDate()
        .toString()
        .padStart(2, '0')}`;
      yield '  <url>\n';
      yield `    <loc>${rootFrontendUrl}${entry.path}</loc>\n`;
      yield `    <lastmod>${lastModifiedDate}</lastmod>\n`;
      yield '  </url>\n';
    }
  }

  yield '</urlset>\n';
};

const createGeneratorForSitemapPlain = function* (rootFrontendUrl: string, sitemap: Sitemap) {
  for (const entry of sitemap.entries) {
    yield `${rootFrontendUrl}${entry.path}\n`;
  }
};
