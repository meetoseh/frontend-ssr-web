import chalk from 'chalk';
import { CommandLineArgs } from '../../../CommandLineArgs';
import { CancelablePromise } from '../../../lib/CancelablePromise';
import { withItgsCancelable } from '../../../lib/Itgs';
import { withRedisStatsUsingPromise } from '../../../lib/RedisStatsPreparer';
import { unixTimestampToUnixDate } from '../../../lib/unixDates';
import { createComponentRoutes } from '../../lib/createComponentRoutes';
import { simpleUidPath } from '../../lib/pathHelpers';
import { PendingRoute } from '../../lib/route';
import { ShareLinkApp, ShareLinkProps } from '../components/ShareLinkApp';
import { JourneyLinkStatsPreparer } from '../lib/JourneyLinkStatsPreparer';
import { colorNow } from '../../../logging';
import { inspect } from 'util';
import { randomBytes } from 'crypto';
import { createImageFileJWT } from '../../../lib/createImageFileJWT';
import { createContentFileJWT } from '../../../lib/createContentFileJWT';
import { thumbHashToDataURL } from 'thumbhash';
import { createTranscriptJWT } from '../../../lib/createTranscriptJWT';
import { OpenGraphMetaImage } from '../../../uikit/lib/OpenGraphMetaImage';

export const shareLink = async (args: CommandLineArgs): Promise<PendingRoute[]> =>
  createComponentRoutes<ShareLinkProps>({
    path: (routerPrefix: string) => {
      const pathExtractor = simpleUidPath(true)(routerPrefix);
      return (path: string): CancelablePromise<boolean> | boolean => pathExtractor(path) !== null;
    },
    templatedRelativePath: '/{code}',
    assetsPath: '/share-links/assets',
    buildFolder: `build/routes/shareLink`,
    componentPath: 'src/routers/journeys/components/ShareLinkApp.tsx',
    component: (props) => <ShareLinkApp {...props} />,
    body: async (bundleArgs) => {
      const unprefixedStylesheets = Object.values(bundleArgs.assetsByName)
        .filter((a) => a.localPath.endsWith('.css'))
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((a) => a.unprefixedPath);

      return (routerPrefix) => {
        const pathExtractor = simpleUidPath(true)(routerPrefix);
        const stylesheets = unprefixedStylesheets.map((href) => `${routerPrefix}${href}`);
        const tz = 'America/Los_Angeles';

        return (args): CancelablePromise<ShareLinkProps> => {
          if (args.req.url === undefined) {
            throw new Error('no url');
          }
          const code = pathExtractor(args.req.url);
          if (code === null) {
            throw new Error('no code');
          }

          return withItgsCancelable((itgs) =>
            withRedisStatsUsingPromise(itgs, async (stats): Promise<ShareLinkProps> => {
              if (args.state.finishing) {
                throw new Error('canceled');
              }

              const requestAtMS = Date.now();
              const requestAtSeconds = requestAtMS / 1000;
              const requestAtUnixDate = unixTimestampToUnixDate(requestAtMS, { tz });

              const at1m = Math.floor(requestAtMS / 60_000);
              const at10m = Math.floor(requestAtMS / 600_000);

              const linkStats = new JourneyLinkStatsPreparer(stats);
              linkStats.incrViewHydrationRequests({
                unixDate: requestAtUnixDate,
              });

              const redis = await itgs.redis();
              if (args.state.finishing) {
                throw new Error('canceled');
              }

              const invalid1mKey = `journey_share_links:ratelimiting:1m:${at1m}:invalid`;
              const invalid10mKey = `journey_share_links:ratelimiting:10m:${at10m}:invalid`;

              let invalid1mRaw: string | null = null;
              let invalid10mRaw: string | null = null;
              try {
                [invalid1mRaw, invalid10mRaw] = await Promise.all([
                  redis.get(invalid1mKey),
                  redis.get(invalid10mKey),
                ]);
              } catch (e) {
                console.log(
                  `${colorNow()} ${chalk.white('shareLink')}${chalk.grey(':')} ${chalk.redBright(
                    'error fetching ratelimiting information from redis'
                  )}${chalk.gray(':')}\n${inspect(e, { colors: chalk.level >= 1 })}`
                );

                linkStats.incrViewHydrationRejected({ unixDate: requestAtUnixDate });
                return {
                  code: code,
                  journey: undefined,
                  stylesheets,
                  metaImages: [],
                };
              }

              const invalid1m = invalid1mRaw === null ? 0 : parseInt(invalid1mRaw, 10);
              const invalid10m = invalid10mRaw === null ? 0 : parseInt(invalid10mRaw, 10);

              if (invalid1m > 3 || invalid10m > 10) {
                console.log(
                  `${colorNow()} ${chalk.gray('shareLink:')} ${chalk.yellowBright(
                    'ratelimiting'
                  )} ${chalk.gray(
                    `watermarks hit; 1m: ${invalid1m}/3 via ${invalid1mKey}, 10m: ${invalid10m}/10 via ${invalid10mKey}`
                  )}`
                );
                linkStats.incrViewHydrationRejected({ unixDate: requestAtUnixDate });
                return {
                  code: code,
                  journey: undefined,
                  stylesheets,
                  metaImages: [],
                };
              } else {
                console.log(
                  `${colorNow()} ${chalk.gray(
                    `shareLink: not ratelimiting; 1m: ${invalid1m}/3 via ${invalid1mKey}, 10m: ${invalid10m}/10 via ${invalid10mKey}`
                  )}`
                );
              }

              const viewUid = `oseh_jslv_${randomBytes(16).toString('base64url')}`;

              const conn = await itgs.conn();
              if (args.state.finishing) {
                throw new Error('canceled');
              }

              const cursor = conn.cursor('none');
              const abortController = new AbortController();
              const doAbort = () => abortController.abort();
              args.state.cancelers.add(doAbort);

              const responses = await cursor.executeUnified3(
                [
                  [
                    `
  SELECT
    journey_slugs.slug,
    journeys.uid,
    journeys.title,
    journeys.description,
    instructors.name,
    audio_content_files.uid,
    audio_content_files.duration_seconds,
    image_file_exports.thumbhash,
    image_files.uid,
    transcripts.uid,
    journey_subcategories.internal_name,
    journey_share_links.uid
  FROM 
    journey_share_links, 
    journeys,
    instructors,
    journey_subcategories,
    content_files AS audio_content_files, 
    image_files, 
    image_file_exports
  LEFT OUTER JOIN journey_slugs
  ON (
    journey_slugs.journey_id = journeys.id
    AND NOT EXISTS (
      SELECT 1 FROM journey_slugs AS js
      WHERE
        js.journey_id = journeys.id
        AND (
          js.primary_at > journey_slugs.primary_at
          OR (
            js.primary_at = journey_slugs.primary_at
            AND js.slug < journey_slugs.slug
          )
        )
    )
  )
  LEFT OUTER JOIN transcripts
  ON (
    EXISTS (
      SELECT 1 FROM content_file_transcripts
      WHERE
        content_file_transcripts.content_file_id = audio_content_files.id
        AND content_file_transcripts.transcript_id = transcripts.id
        AND NOT EXISTS (
          SELECT 1 FROM content_file_transcripts AS cft
          WHERE
            cft.content_file_id = audio_content_files.id
            AND (
              cft.created_at > content_file_transcripts.created_at
              OR (
                cft.created_at = content_file_transcripts.created_at
                AND cft.uid < content_file_transcripts.uid
              )
            )
        )
    )
  )
  WHERE
    journey_share_links.code = ?
    AND journey_share_links.journey_id = journeys.id
    AND journeys.instructor_id = instructors.id
    AND journeys.journey_subcategory_id = journey_subcategories.id
    AND journeys.audio_content_file_id = audio_content_files.id
    AND journeys.darkened_background_image_file_id = image_files.id
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
    AND journeys.deleted_at IS NULL
    AND journeys.special_category IS NULL
    ${/* we purposely are allowing courses */ ''}
                    `,
                    [code],
                  ],
                  [
                    `
SELECT
  image_files.uid,
  image_file_exports.uid,
  image_file_exports.width,
  image_file_exports.height,
  image_file_exports.format
FROM journey_share_links, journeys, image_files, image_file_exports
WHERE
  journey_share_links.code = ?
  AND journeys.deleted_at IS NULL
  AND journeys.special_category IS NULL
  AND journey_share_links.journey_id = journeys.id
  AND journeys.share_image_file_id = image_files.id
  AND image_file_exports.image_file_id = image_files.id
ORDER BY image_file_exports.width DESC, image_file_exports.height DESC
                    `,
                    [code],
                  ],
                ],
                {
                  signal: abortController.signal,
                }
              );

              const response = responses.items[0];
              const metaImagesResponse = responses.items[1];

              args.state.cancelers.remove(doAbort);

              if (args.state.finishing) {
                throw new Error('canceled');
              }

              if (response.results === undefined || response.results.length === 0) {
                const redisResponseRaw = await redis
                  .multi()
                  .set(`journey_share_links:known_bad_code:${code}`, '1', {
                    NX: true,
                    EX: 600,
                  })
                  .hSet(`journey_share_links:views:${viewUid}`, {
                    uid: viewUid,
                    journey_share_link_code: code,
                    clicked_at: requestAtSeconds.toString(),
                  })
                  .zAdd('journey_share_links:views_unconfirmed', {
                    score: requestAtSeconds,
                    value: viewUid,
                  })
                  .exec();
                const knownBadRaw = redisResponseRaw[0];
                const ratelimitingApplies = knownBadRaw !== null;
                linkStats.incrViewHydrationFailed({
                  unixDate: requestAtUnixDate,
                  ratelimitingApplies,
                });

                if (ratelimitingApplies) {
                  console.log(
                    `${colorNow()} ${chalk.gray('shareLink:')} ${chalk.yellowBright(
                      'bad code checked'
                    )}${chalk.gray(':')} ${chalk.whiteBright(code)} ${chalk.gray(
                      'this code has not been checked recently, and is not valid, which is a sign of automated code scanning. incrementing ratelimiting counters.'
                    )}\n${chalk.gray('  headers:')} ${inspect(args.req.headers, {
                      colors: chalk.level >= 1,
                    })}`
                  );
                  linkStats.incrRatelimiting({
                    duration: '1m',
                    at: at1m,
                    category: 'invalid',
                    expireAt: (at1m + 1) * 60 + 60 * 30,
                  });
                  linkStats.incrRatelimiting({
                    duration: '10m',
                    at: at10m,
                    category: 'invalid',
                    expireAt: (at10m + 1) * 600 + 60 * 30,
                  });
                } else {
                  console.log(
                    `${colorNow()} ${chalk.gray(
                      'shareLink: known bad code checked:'
                    )} ${chalk.white(code)} ${chalk.gray(
                      'this code has been checked recently, so there is probably a bad link out there'
                    )}`
                  );
                }

                return {
                  code,
                  viewUid,
                  journey: null,
                  stylesheets,
                  metaImages: [],
                };
              }

              const [
                journeySlug,
                journeyUid,
                journeyTitle,
                journeyDescription,
                instructorName,
                audioContentFileUid,
                audioContentFileDurationSeconds,
                imageThumbhashBase64,
                imageFileUid,
                transcriptUid,
                journeySubcategoryInternalName,
                linkUid,
              ] = response.results[0];
              const shareImageFileUid = metaImagesResponse.results?.[0]?.[0] as string | undefined;
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
              const [imageJwt, audioJwt, transcriptJwt, shareImageJwt] = await Promise.all([
                createImageFileJWT(imageFileUid),
                createContentFileJWT(audioContentFileUid),
                transcriptUid === null ? Promise.resolve(null) : createTranscriptJWT(transcriptUid),
                shareImageFileUid === undefined
                  ? Promise.resolve(null)
                  : createImageFileJWT(shareImageFileUid),
              ]);

              linkStats.incrViewHydrated({
                unixDate: requestAtUnixDate,
                journeySubcategoryInternalName,
              });

              await redis
                .multi()
                .hSet('journey_share_links:views:' + viewUid, {
                  uid: viewUid,
                  journey_share_link_code: code,
                  journey_share_link_uid: linkUid,
                  clicked_at: requestAtSeconds.toString(),
                })
                .zAdd('journey_share_links:views_unconfirmed', {
                  score: requestAtSeconds,
                  value: viewUid,
                })
                .exec();

              const metaImages =
                shareImageJwt === null
                  ? []
                  : shareImageFileExports.map((metaImage) => ({
                      url: `${process.env.ROOT_BACKEND_URL}/api/1/image_files/image/${metaImage.exportUid}.${metaImage.format}?jwt=${shareImageJwt}`,
                      width: metaImage.width,
                      height: metaImage.height,
                      type: metaImage.type,
                    }));

              const userAgent = args.req.headers['user-agent'];
              if (userAgent !== undefined) {
                const userAgentLower = userAgent.toLowerCase();
                if (
                  userAgentLower.includes('twitterbot') &&
                  userAgentLower.includes('facebookexternalhit')
                ) {
                  // iMessage can only handle 1 meta image and prefers square
                  if (metaImages.length > 1) {
                    metaImages.sort(
                      (a, b) => Math.abs(a.width / a.height - 1) - Math.abs(b.width / b.height - 1)
                    );
                    metaImages.splice(1, metaImages.length - 1);
                  }
                }
              }

              return {
                code,
                viewUid,
                journey: {
                  canonicalUrl:
                    journeySlug === null
                      ? undefined
                      : `${process.env.ROOT_FRONTEND_URL}/shared/${journeySlug}`,
                  impliedUTM: {
                    source: 'oseh_app',
                    medium: 'referral',
                    campaign: 'share_link',
                    content: journeyUid,
                    term: code,
                  },
                  uid: journeyUid,
                  slug: journeySlug,
                  title: journeyTitle,
                  description: journeyDescription,
                  instructor: instructorName,
                  durationSeconds: audioContentFileDurationSeconds,
                  imageThumbhashDataUrl,
                  backgroundImage: {
                    uid: imageFileUid,
                    jwt: imageJwt,
                  },
                  transcriptRef:
                    transcriptUid === null || transcriptJwt === null
                      ? null
                      : {
                          uid: transcriptUid,
                          jwt: transcriptJwt,
                        },
                  audio: {
                    uid: audioContentFileUid,
                    jwt: audioJwt,
                  },
                },
                stylesheets,
                metaImages,
              };
            })
          );
        };
      };
    },
    docs: {
      tags: ['journeys'],
      summary: `Share links`,
      description: 'HTML pages for share links',
      operationId: `shareLink`,
    },
    args,
    getSitemapEntries: () => ({
      done: () => true,
      cancel: () => {},
      promise: Promise.resolve(),
    }),
  });
