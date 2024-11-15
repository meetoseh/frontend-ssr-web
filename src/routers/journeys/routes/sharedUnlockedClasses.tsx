import { AdaptedRqliteResultItem } from 'rqdb';
import { CommandLineArgs } from '../../../CommandLineArgs';
import { CancelablePromise } from '../../../lib/CancelablePromise';
import { constructCancelablePromise } from '../../../lib/CancelablePromiseConstructor';
import { withItgs, withItgsCancelable } from '../../../lib/Itgs';
import { createCancelablePromiseFromCallbacks } from '../../../lib/createCancelablePromiseFromCallbacks';
import { createComponentRoutes } from '../../lib/createComponentRoutes';
import { simpleUidPath } from '../../lib/pathHelpers';
import { PendingRoute } from '../../lib/route';
import { hashElementForSitemap } from '../../sitemap/lib/hashElementForSitemap';
import {
  SharedUnlockedClassApp,
  SharedUnlockedClassBody,
  SharedUnlockedClassProps,
} from '../components/SharedUnlockedClassApp';
import { SitemapEntry } from '../../sitemap/lib/Sitemap';
import { finishWithEncodedServerResponse } from '../../lib/acceptEncoding';
import { Readable } from 'stream';
import { thumbHashToDataURL } from 'thumbhash';
import { createImageFileJWT } from '../../../lib/createImageFileJWT';
import { createContentFileJWT } from '../../../lib/createContentFileJWT';
import { createTranscriptJWT } from '../../../lib/createTranscriptJWT';
import { createFakeCancelable } from '../../../lib/createFakeCancelable';
import { OpenGraphMetaImage } from '../../../uikit/lib/OpenGraphMetaImage';
import { filterMetaImagesForUserAgent } from '../../../uikit/lib/filterMetaImagesForUserAgent';
import { SERIES_FLAGS } from '../lib/SeriesFlags';

export const sharedUnlockedClasses = async (args: CommandLineArgs): Promise<PendingRoute[]> =>
  createComponentRoutes<SharedUnlockedClassProps>({
    path: (routerPrefix: string) => {
      const pathExtractor = simpleUidPath(true)(routerPrefix);

      return (path: string): CancelablePromise<boolean> | boolean => {
        const slug = pathExtractor(path);
        if (slug === null) {
          return false;
        }

        return constructCancelablePromise({
          body: async (state, resolve, reject) => {
            await withItgs(async (itgs) => {
              const conn = await itgs.conn();
              const cursor = conn.cursor('none');

              if (state.finishing) {
                state.done = true;
                reject(new Error('canceled'));
                return;
              }

              const abortController = new AbortController();
              const abortSignal = abortController.signal;
              state.cancelers.add(() => {
                abortController.abort();
              });

              let response: AdaptedRqliteResultItem;
              try {
                response = await cursor.execute(
                  `
SELECT 1 FROM journey_slugs, journeys
WHERE
  journey_slugs.slug = ?
  AND journey_slugs.journey_id IS NOT NULL
  AND journey_slugs.journey_id = journeys.id
  AND journeys.deleted_at IS NULL
  AND journeys.special_category IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM course_journeys, courses
    WHERE 
      course_journeys.journey_id = journeys.id
      AND course_journeys.course_id = courses.id
      AND (courses.flags & ?) = 0
  )
                  `,
                  [slug, SERIES_FLAGS.JOURNEYS_IN_SERIES_PUBLIC_SHAREABLE],
                  {
                    signal: abortSignal,
                  }
                );
              } catch (e) {
                const canceled = state.finishing;
                state.finishing = true;
                state.done = true;
                reject(new Error(canceled ? 'canceled' : `database error: ${e}`));
                return;
              }

              state.finishing = true;
              state.done = true;
              resolve(response.results !== undefined && response.results.length > 0);
            });
          },
        });
      };
    },
    templatedRelativePath: '/{slug}',
    assetsPath: '/unlocked/assets',
    buildFolder: `build/routes/allOneMinuteClasses`,
    componentPath: 'src/routers/journeys/components/SharedUnlockedClassApp.tsx',
    component: (props) => <SharedUnlockedClassApp {...props} />,
    body: async (bundleArgs) => {
      const unprefixedStylesheets = Object.values(bundleArgs.assetsByName)
        .filter((a) => a.localPath.endsWith('.css'))
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((a) => a.unprefixedPath);

      return (routerPrefix) => {
        const pathExtractor = simpleUidPath(true)(routerPrefix);
        const stylesheets = unprefixedStylesheets.map((href) => `${routerPrefix}${href}`);
        return (args): CancelablePromise<SharedUnlockedClassProps> => {
          if (args.req.url === undefined) {
            throw new Error('no url');
          }
          const slug = pathExtractor(args.req.url);

          return withItgsCancelable(
            (itgs): CancelablePromise<SharedUnlockedClassProps> =>
              createFakeCancelable(async (): Promise<SharedUnlockedClassProps> => {
                const conn = await itgs.conn();
                const cursor = conn.cursor('none');
                const canceled = createCancelablePromiseFromCallbacks(args.state.cancelers);
                canceled.promise.catch(() => {});
                if (args.state.finishing) {
                  canceled.cancel();
                  throw new Error('canceled');
                }

                const abortController = new AbortController();
                const abortSignal = abortController.signal;
                const handleAbort = () => {
                  abortController.abort();
                };
                args.state.cancelers.add(handleAbort);

                try {
                  const allResponses = await cursor.executeUnified3(
                    [
                      [
                        `
SELECT
  canonical_journey_slugs.slug,
  canonical_journey_slugs.primary_at,
  journeys.uid,
  journeys.title,
  journeys.description,
  image_file_exports.thumbhash,
  image_files.uid,
  instructors.name,
  content_files.duration_seconds,
  content_files.uid,
  transcripts.uid
FROM journeys, journey_slugs AS canonical_journey_slugs, image_files, image_file_exports, instructors, content_files
LEFT OUTER JOIN content_file_transcripts ON (
  content_file_transcripts.content_file_id = content_files.id
  AND NOT EXISTS (
    SELECT 1 FROM content_file_transcripts AS cft
    WHERE
      cft.content_file_id = content_files.id
      AND (
        cft.created_at > content_file_transcripts.created_at
        OR (
          cft.created_at = content_file_transcripts.created_at
          AND cft.uid < content_file_transcripts.uid
        )
      )
  )
)
LEFT OUTER JOIN transcripts ON transcripts.id = content_file_transcripts.transcript_id
WHERE
  journeys.id = canonical_journey_slugs.journey_id
  AND NOT EXISTS (
    SELECT 1 FROM journey_slugs AS js
    WHERE
      js.journey_id = canonical_journey_slugs.journey_id
      AND (
        js.primary_at > canonical_journey_slugs.primary_at 
        OR (
          js.primary_at = canonical_journey_slugs.primary_at
          AND js.slug < canonical_journey_slugs.slug
        )
      )
  )
  AND journeys.deleted_at IS NULL
  AND journeys.special_category IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM course_journeys, courses
    WHERE 
      course_journeys.journey_id = journeys.id
      AND course_journeys.course_id = courses.id
      AND (courses.flags & ?) = 0
  )
  AND EXISTS (
    SELECT 1 FROM journey_slugs
    WHERE
      journey_slugs.journey_id = journeys.id
      AND journey_slugs.slug = ?
  )
  AND image_files.id = journeys.darkened_background_image_file_id
  AND image_file_exports.image_file_id = image_files.id
  AND image_file_exports.id = (
    SELECT ife.id FROM image_file_exports AS ife
    WHERE
      ife.image_file_id = image_files.id
    ORDER BY
      CASE WHEN ife.width = 375 THEN 1 ELSE -ife.width END DESC,
      CASE WHEN ife.height = 667 THEN 1 ELSE -ife.height END DESC,
      CASE WHEN ife.format = 'webp' THEN 'aaaaa' ELSE ife.format END ASC,
      ife.id ASC
    LIMIT 1
  )
  AND content_files.id = journeys.audio_content_file_id
  AND instructors.id = journeys.instructor_id
                        `,
                        [SERIES_FLAGS.JOURNEYS_IN_SERIES_PUBLIC_SHAREABLE, slug],
                      ],
                      [
                        `
    SELECT
      image_files.uid,
      image_file_exports.uid,
      image_file_exports.width,
      image_file_exports.height,
      image_file_exports.format
    FROM journey_slugs, journeys, image_files, image_file_exports
    WHERE
      journey_slugs.slug = ?
      AND journeys.id = journey_slugs.journey_id
      AND journeys.deleted_at IS NULL
      AND journeys.special_category IS NULL
      AND journeys.share_image_file_id = image_files.id
      AND image_file_exports.image_file_id = image_files.id
    ORDER BY image_file_exports.width DESC, image_file_exports.height DESC
                        `,
                        [slug],
                      ],
                    ],
                    {
                      signal: abortSignal,
                    }
                  );

                  if (args.state.finishing) {
                    throw new Error('canceled');
                  }

                  const response = allResponses.items[0];
                  const metaImagesResponse = allResponses.items[1];
                  if (response.results === undefined || response.results.length === 0) {
                    throw new Error('not found');
                  }

                  const [
                    canonicalSlug,
                    canonicalSlugSince,
                    uid,
                    title,
                    description,
                    imageThumbhashBase64,
                    imageUid,
                    instructor,
                    durationSeconds,
                    audioUid,
                    transcriptUid,
                  ] = response.results[0];
                  if (slug !== canonicalSlug) {
                    const secondsSinceCanonical = Date.now() / 1000 - canonicalSlugSince;
                    const beenSevenDays = secondsSinceCanonical > 7 * 24 * 60 * 60;

                    args.resp.statusCode = beenSevenDays ? 301 : 302;
                    args.resp.statusMessage = beenSevenDays ? 'Moved Permanently' : 'Found';
                    args.resp.setHeader('Content-Encoding', 'identity');
                    args.resp.setHeader('Location', `${routerPrefix}/${canonicalSlug}`);
                    await finishWithEncodedServerResponse(
                      args,
                      'identity',
                      Readable.from(Buffer.from(''))
                    );
                    throw new Error('handled');
                  }

                  const shareImageFileUid = metaImagesResponse.results?.[0]?.[0] as
                    | string
                    | undefined;
                  const shareImageFileExports: (Omit<OpenGraphMetaImage, 'url'> & {
                    exportUid: string;
                    format: string;
                  })[] = (
                    metaImagesResponse.results === undefined ? [] : metaImagesResponse.results
                  ).map(([, exportUid, width, height, format]) => ({
                    exportUid: exportUid as string,
                    width: width as number,
                    height: height as number,
                    format: format as string,
                    type: `image/${format}`,
                  }));

                  const imageThumbhashDataUrl = thumbHashToDataURL(
                    Buffer.from(imageThumbhashBase64, 'base64url')
                  );
                  const imageJwt = await createImageFileJWT(imageUid);
                  const audioJwt = await createContentFileJWT(audioUid);
                  const transcriptJwt =
                    transcriptUid === null ? null : await createTranscriptJWT(transcriptUid);
                  const shareImageJwt =
                    shareImageFileUid === undefined
                      ? null
                      : await createImageFileJWT(shareImageFileUid);
                  const metaImages =
                    shareImageJwt === null
                      ? []
                      : shareImageFileExports.map((metaImage) => ({
                          url: `${process.env.ROOT_BACKEND_URL}/api/1/image_files/image/${metaImage.exportUid}.${metaImage.format}?jwt=${shareImageJwt}`,
                          width: metaImage.width,
                          height: metaImage.height,
                          type: metaImage.type,
                        }));
                  filterMetaImagesForUserAgent(metaImages, args.req.headers['user-agent']);

                  return {
                    uid,
                    slug: canonicalSlug,
                    imageThumbhashDataUrl,
                    metaImages,
                    backgroundImage: {
                      uid: imageUid,
                      jwt: imageJwt,
                    },
                    audio: {
                      uid: audioUid,
                      jwt: audioJwt,
                    },
                    transcriptRef:
                      transcriptUid === null || transcriptJwt === null
                        ? null
                        : {
                            uid: transcriptUid,
                            jwt: transcriptJwt,
                          },
                    title,
                    description,
                    instructor,
                    durationSeconds,
                    stylesheets,
                  };
                } finally {
                  canceled.cancel();
                  args.state.cancelers.remove(handleAbort);
                }
              })
          );
        };
      };
    },
    docs: {
      tags: ['journeys'],
      summary: `Unlocked classes`,
      description: 'HTML pages for unlocked classes',
      operationId: `sharedUnlockedClass`,
    },
    args,
    getSitemapEntries: (routerPrefix, pump) =>
      constructCancelablePromise({
        body: async (state, resolve, reject) => {
          await withItgs(async (itgs) => {
            const conn = await itgs.conn();
            const cursor = conn.cursor('none');

            if (state.finishing) {
              state.done = true;
              reject(new Error('canceled'));
              return;
            }

            const canceled = createCancelablePromiseFromCallbacks(state.cancelers);
            const abortController = new AbortController();
            const abortSignal = abortController.signal;
            state.cancelers.add(() => {
              abortController.abort();
            });

            let lastSlug: string | null = null;
            while (true) {
              if (state.finishing) {
                state.done = true;
                reject(new Error('canceled'));
                return;
              }

              let response: AdaptedRqliteResultItem;
              try {
                response = await cursor.execute(
                  `
  SELECT
    journey_slugs.slug,
    journeys.uid,
    journeys.title,
    journeys.description,
    instructors.name,
    content_files.duration_seconds
  FROM journey_slugs, journeys, instructors, content_files
  WHERE
    journey_slugs.journey_id IS NOT NULL
    AND journey_slugs.journey_id = journeys.id
    AND (? IS NULL OR journey_slugs.slug > ?)
    AND NOT EXISTS (
      SELECT 1 FROM journey_slugs AS js
      WHERE
        journey_slugs.journey_id = js.journey_id
        AND (
          js.primary_at > journey_slugs.primary_at
          OR (
            js.primary_at = journey_slugs.primary_at
            AND js.slug < journey_slugs.slug
          )
        )
    )
    AND journeys.deleted_at IS NULL
    AND journeys.special_category IS NULL
    AND NOT EXISTS (
      SELECT 1 FROM course_journeys, courses
      WHERE 
        course_journeys.journey_id = journey_slugs.journey_id
        AND course_journeys.course_id = courses.id
        AND (courses.flags & ?) = 0
    )
    AND (
      journeys.variation_of_journey_id IS NULL 
      OR (
        NOT EXISTS (
          SELECT 1 FROM journeys AS variations
          WHERE
            variations.id = journeys.variation_of_journey_id
            AND variations.deleted_at IS NULL
            AND variations.special_category IS NULL
            AND NOT EXISTS (
              SELECT 1 FROM course_journeys
              WHERE course_journeys.journey_id = variations.id
            )
        )
        AND NOT EXISTS (
          SELECT 1 FROM journeys AS variations
          WHERE
            variations.variation_of_journey_id = journeys.variation_of_journey_id
            AND variations.deleted_at IS NULL
            AND variations.special_category IS NULL
            AND NOT EXISTS (
              SELECT 1 FROM course_journeys
              WHERE course_journeys.journey_id = variations.id
            )
            AND variations.uid < journeys.uid
        )
      )
    )
    AND content_files.id = journeys.video_content_file_id
    AND instructors.id = journeys.instructor_id
  ORDER BY journey_slugs.slug ASC
  LIMIT 100
                  `,
                  [lastSlug, lastSlug, SERIES_FLAGS.JOURNEYS_IN_SERIES_PUBLIC_SHAREABLE],
                  {
                    signal: abortSignal,
                  }
                );
              } catch (e) {
                const canceled = state.finishing;
                state.finishing = true;
                state.done = true;
                reject(new Error(canceled ? 'canceled' : `database error: ${e}`));
                return;
              }

              if (response.results === undefined || response.results.length === 0) {
                break;
              }

              const entries = response.results.map(
                ([slug, uid, title, description, instructor, durationSeconds]): SitemapEntry => ({
                  path: `${routerPrefix}/${slug}`,
                  significantContentSHA512: hashElementForSitemap(
                    <SharedUnlockedClassBody
                      uid={uid}
                      title={title}
                      description={description}
                      imageThumbhashDataUrl=""
                      backgroundImage={{ uid: '', jwt: '' }}
                      audio={{ uid: '', jwt: '' }}
                      instructor={instructor}
                      durationSeconds={durationSeconds}
                      transcriptRef={null}
                    />
                  ),
                })
              );
              const pumpPromise = pump(entries);
              await Promise.race([pumpPromise.promise, canceled.promise]);
              if (state.finishing) {
                pumpPromise.cancel();
                await pumpPromise.promise;
              }
              lastSlug = response.results[response.results.length - 1][0];
            }

            state.finishing = true;
            state.done = true;
            resolve();
          });
        },
      }),
  });
