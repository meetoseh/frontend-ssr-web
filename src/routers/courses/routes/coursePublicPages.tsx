import { AdaptedRqliteResultItem } from 'rqdb';
import { CommandLineArgs } from '../../../CommandLineArgs';
import { CancelablePromise } from '../../../lib/CancelablePromise';
import { constructCancelablePromise } from '../../../lib/CancelablePromiseConstructor';
import { withItgs, withItgsCancelable } from '../../../lib/Itgs';
import { createComponentRoutes } from '../../lib/createComponentRoutes';
import { simpleUidPath } from '../../lib/pathHelpers';
import { PendingRoute } from '../../lib/route';
import {
  CoursePublicPageApp,
  CoursePublicPageAppProps,
  CoursePublicPageJourney,
} from '../components/CoursePublicPageApp';
import { SERIES_FLAGS } from '../../journeys/lib/SeriesFlags';
import { createFakeCancelable } from '../../../lib/createFakeCancelable';
import { createCancelablePromiseFromCallbacks } from '../../../lib/createCancelablePromiseFromCallbacks';
import { OpenGraphMetaImage } from '../../../uikit/lib/OpenGraphMetaImage';
import { thumbHashToDataURL } from 'thumbhash';
import { createImageFileJWT } from '../../../lib/createImageFileJWT';
import { createContentFileJWT } from '../../../lib/createContentFileJWT';
import { createTranscriptJWT } from '../../../lib/createTranscriptJWT';
import { filterMetaImagesForUserAgent } from '../../../uikit/lib/filterMetaImagesForUserAgent';
import { SitemapEntry } from '../../sitemap/lib/Sitemap';
import { hashElementForSitemap } from '../../sitemap/lib/hashElementForSitemap';

/**
 * Serves /shared/series/{slug} and related artifacts via the CoursePublicPageApp component.
 */
export const coursePublicPages = async (args: CommandLineArgs): Promise<PendingRoute[]> =>
  createComponentRoutes<CoursePublicPageAppProps>({
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
SELECT 1 FROM courses
WHERE
  courses.slug = ?
  AND (courses.flags & ?) <> 0
  AND courses.hero_image_file_id IS NOT NULL
  AND courses.share_image_file_id IS NOT NULL
  AND courses.video_content_file_id IS NOT NULL
  AND courses.video_thumbnail_image_file_id IS NOT NULL
                `,
                  [slug, SERIES_FLAGS.SERIES_PUBLIC_SHAREABLE],
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
    assetsPath: '/assets',
    buildFolder: `build/routes/allCoursePublicPages`,
    componentPath: 'src/routers/courses/components/CoursePublicPageApp.tsx',
    component: (props) => <CoursePublicPageApp {...props} />,
    body: async (bundleArgs) => {
      const unprefixedStylesheets = Object.values(bundleArgs.assetsByName)
        .filter((a) => a.localPath.endsWith('.css'))
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((a) => a.unprefixedPath);

      return (routerPrefix) => {
        const pathExtractor = simpleUidPath(true)(routerPrefix);
        const stylesheets = unprefixedStylesheets.map((href) => `${routerPrefix}${href}`);
        return (args): CancelablePromise<CoursePublicPageAppProps> => {
          if (args.req.url === undefined) {
            throw new Error('no url');
          }
          const slugUnch = pathExtractor(args.req.url);
          if (slugUnch === null) {
            throw new Error('no slug');
          }
          const slug = slugUnch;

          return withItgsCancelable(
            (itgs): CancelablePromise<CoursePublicPageAppProps> =>
              createFakeCancelable(async (): Promise<CoursePublicPageAppProps> => {
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
  courses.uid,
  courses.title,
  instructors.name,
  courses.description,
  hero_image_thumbhash_exports.thumbhash,
  hero_images.uid,
  video_thumbnail_thumbhash_exports.thumbhash,
  video_content_files.uid,
  transcripts.uid
FROM 
  courses, 
  instructors, 
  image_files AS hero_images, 
  image_file_exports AS hero_image_thumbhash_exports,
  image_file_exports AS video_thumbnail_thumbhash_exports,
  content_files AS video_content_files
LEFT OUTER JOIN transcripts
ON (
  transcripts.id = (
    SELECT content_file_transcripts.transcript_id FROM content_file_transcripts
    WHERE
      content_file_transcripts.content_file_id = video_content_files.id
    ORDER BY content_file_transcripts.created_at DESC
    LIMIT 1
  )
)
WHERE
  courses.slug = ?
  AND (courses.flags & ?) <> 0
  AND instructors.id = courses.instructor_id
  AND hero_images.id = courses.hero_image_file_id
  AND hero_image_thumbhash_exports.id = (
    SELECT ife.id FROM image_file_exports AS ife
    WHERE
      ife.image_file_id = courses.hero_image_file_id
      AND ife.width = 540
      AND ife.height = 540
      AND ife.format = 'jpeg'
    ORDER BY ife.uid DESC
    LIMIT 1
  )
  AND video_thumbnail_thumbhash_exports.id = (
    SELECT ife.id FROM image_file_exports AS ife
    WHERE
      ife.image_file_id = courses.video_thumbnail_image_file_id
      AND ife.width = 180
      AND ife.height = 368
      AND ife.format = 'jpeg'
    ORDER BY ife.uid DESC
    LIMIT 1
  )
  AND video_content_files.id = courses.video_content_file_id
                      `,
                        [slug, SERIES_FLAGS.SERIES_PUBLIC_SHAREABLE],
                      ],
                      [
                        `
SELECT
  journeys.title,
  journeys.description,
  content_files.duration_seconds
FROM courses, course_journeys, journeys, content_files
WHERE
  courses.slug = ?
  AND (courses.flags & ?) <> 0
  AND course_journeys.course_id = courses.id
  AND course_journeys.journey_id = journeys.id
  AND journeys.deleted_at IS NULL
  AND content_files.id = journeys.audio_content_file_id
ORDER BY course_journeys.priority ASC
                        `,
                        [slug, SERIES_FLAGS.SERIES_PUBLIC_SHAREABLE],
                      ],
                      [
                        `
  SELECT
    image_files.uid,
    image_file_exports.uid,
    image_file_exports.width,
    image_file_exports.height,
    image_file_exports.format
  FROM courses, image_files, image_file_exports
  WHERE
    courses.slug = ?
    AND (courses.flags & ?) <> 0
    AND courses.share_image_file_id = image_files.id
    AND image_file_exports.image_file_id = image_files.id
  ORDER BY image_file_exports.width DESC, image_file_exports.height DESC
                      `,
                        [slug, SERIES_FLAGS.SERIES_PUBLIC_SHAREABLE],
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
                  const journeysResponse = allResponses.items[1];
                  const metaImagesResponse = allResponses.items[2];
                  if (response.results === undefined || response.results.length === 0) {
                    throw new Error('not found');
                  }

                  const [
                    uid,
                    title,
                    instructor,
                    description,
                    heroImageThumbhashBase64,
                    heroUid,
                    videoThumbnailThumbhashBase64,
                    videoUid,
                    transcriptUid,
                  ] = response.results[0];

                  const journeys = (journeysResponse.results ?? []).map(
                    (row): CoursePublicPageJourney => ({
                      title: row[0],
                      description: row[1],
                      durationSeconds: row[2],
                    })
                  );

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

                  const heroThumbhashDataURL = thumbHashToDataURL(
                    Buffer.from(heroImageThumbhashBase64, 'base64url')
                  );
                  const heroJwt = await createImageFileJWT(heroUid);
                  const videoJwt = await createContentFileJWT(videoUid);
                  const coverImageThumbhashDataURL = thumbHashToDataURL(
                    Buffer.from(videoThumbnailThumbhashBase64, 'base64url')
                  );
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
                    slug,
                    title,
                    instructor,
                    description,
                    heroThumbhashDataURL,
                    heroImage: {
                      uid: heroUid,
                      jwt: heroJwt,
                    },
                    coverImageThumbhashDataURL,
                    seriesIntroRef: {
                      uid: videoUid,
                      jwt: videoJwt,
                    },
                    transcriptRef:
                      transcriptJwt === null ? null : { uid: transcriptUid, jwt: transcriptJwt },
                    journeys,
                    metaImages,
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
      tags: ['series'],
      summary: `Series overview pages`,
      description: 'HTML pages which describe a series and allow playing the introduction video.',
      operationId: `coursePublicPages`,
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
  courses.slug,
  courses.uid,
  courses.title,
  instructors.name,
  courses.description,
  json_group_array(
    json_array(
      course_journeys.priority,
      journeys.title,
      journeys.description,
      content_files.duration_seconds
    )
  )
FROM courses, instructors, course_journeys, journeys, content_files
WHERE
  (? IS NULL OR courses.slug > ?)
  AND (courses.flags & ?) <> 0
  AND courses.hero_image_file_id IS NOT NULL
  AND courses.share_image_file_id IS NOT NULL
  AND courses.video_content_file_id IS NOT NULL
  AND courses.video_thumbnail_image_file_id IS NOT NULL
  AND instructors.id = courses.instructor_id
  AND course_journeys.course_id = courses.id
  AND course_journeys.journey_id = journeys.id
  AND content_files.id = journeys.audio_content_file_id
GROUP BY courses.id
ORDER BY courses.slug ASC
LIMIT 100
                `,
                  [lastSlug, lastSlug, SERIES_FLAGS.SERIES_PUBLIC_SHAREABLE],
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
                ([slug, uid, title, instructor, description, journeysJsonArr]): SitemapEntry => {
                  const journeysRaw = JSON.parse(journeysJsonArr) as [
                    number,
                    string,
                    string,
                    number,
                  ][];
                  journeysRaw.sort((a, b) => a[0] - b[0]);
                  const journeys = journeysRaw.map(
                    ([, title, description, durationSeconds]): CoursePublicPageJourney => ({
                      title,
                      description,
                      durationSeconds,
                    })
                  );

                  return {
                    path: `${routerPrefix}/${slug}`,
                    significantContentSHA512: hashElementForSitemap(
                      <CoursePublicPageApp
                        uid={uid}
                        slug={slug}
                        title={title}
                        instructor={instructor}
                        description={description}
                        heroThumbhashDataURL=""
                        heroImage={{ uid: '', jwt: '' }}
                        coverImageThumbhashDataURL=""
                        seriesIntroRef={{ uid: '', jwt: '' }}
                        transcriptRef={null}
                        journeys={journeys}
                        metaImages={[]}
                        stylesheets={[]}
                      />
                    ),
                  };
                }
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
