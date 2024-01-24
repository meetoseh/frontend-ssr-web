import { RedisStatsPreparer } from '../../../lib/RedisStatsPreparer';

type ViewClientConfirmedRedis = { store: 'redis'; details: 'in_purgatory' | 'standard' };
type ViewClientConfirmedDatabase = { store: 'database' };
type ViewClientConfirmedExtra = ViewClientConfirmedRedis | ViewClientConfirmedDatabase;
const viewClientConfirmedExtraToEventExtra = (extra: ViewClientConfirmedExtra): string => {
  if (extra.store === 'redis') {
    return `redis:${extra.details}`;
  }
  return 'database';
};

type ViewClientConfirmFailedRedis = {
  store: 'redis';
  details: 'already_confirmed' | 'in_purgatory_but_invalid' | 'in_purgatory_and_already_confirmed';
};
type ViewClientConfirmFailedDatabase = {
  store: 'database';
  details: 'not_found' | 'already_confirmed' | 'too_old';
};
type ViewClientConfirmFailedExtra = ViewClientConfirmFailedRedis | ViewClientConfirmFailedDatabase;
const viewClientConfirmFailedExtraToEventExtra = (extra: ViewClientConfirmFailedExtra): string => {
  return `${extra.store}:${extra.details}`;
};

type ViewClientFollowFailedRatelimitedReason = {
  reason: 'ratelimited';
  category: 'visitor' | 'user' | 'no_user' | 'global';
  duration: '1m' | '10m';
};
type ViewClientFollowFailedInvalidReason = { reason: 'invalid'; ratelimitingApplies: boolean };
type ViewClientFollowFailedServerErrorReason = { reason: 'server_error' };
type ViewClientFollowFailedReason =
  | ViewClientFollowFailedRatelimitedReason
  | ViewClientFollowFailedInvalidReason
  | ViewClientFollowFailedServerErrorReason;
const viewClientFollowFailedReasonToEventExtra = (reason: ViewClientFollowFailedReason): string => {
  if (reason.reason === 'ratelimited') {
    return `${reason.reason}:${reason.category}:${reason.duration}`;
  }
  if (reason.reason === 'invalid') {
    return `${reason.reason}:${reason.ratelimitingApplies ? 'novel_code' : 'repeat_code'}`;
  }
  return reason.reason;
};

/**
 * A wrapper around a redis stats preparer that provides additional types
 * for working with journey share link stats. The meaning of all redis keys
 * are documented in the backend repository under docs/redis/keys.md
 */
export class JourneyLinkStatsPreparer {
  readonly stats: RedisStatsPreparer;

  constructor(stats: RedisStatsPreparer) {
    this.stats = stats;
  }

  private incrShareLinkStat(opts: {
    unixDate: number;
    event: string;
    eventExtra?: string;
    amount?: number;
  }) {
    this.stats.incrby({
      ...opts,
      basicKeyFormat: 'stats:journey_share_links:daily:{unixDate}',
      earliestKey: 'stats:journey_share_links:daily:earliest',
      eventExtraFormat: 'stats:journey_share_links:daily:{unixDate}:extra:{event}',
    });
  }

  /** also increments stats:journey_share_links:links:count */
  incrCreated(opts: { unixDate: number; journeySubcategoryInternalName: string; amount?: number }) {
    this.incrShareLinkStat({
      ...opts,
      event: 'created',
      eventExtra: opts.journeySubcategoryInternalName,
    });
    this.stats.incrDirect('stats:journey_share_links:links:count', opts.amount);
  }

  incrReused(opts: { unixDate: number; journeySubcategoryInternalName: string; amount?: number }) {
    this.incrShareLinkStat({
      ...opts,
      event: 'reused',
      eventExtra: opts.journeySubcategoryInternalName,
    });
  }

  incrViewHydrationRequests(opts: { unixDate: number; amount?: number }) {
    this.incrShareLinkStat({
      ...opts,
      event: 'view_hydration_requests',
    });
  }

  /** also increments stats:journey_share_links:views:count */
  incrViewHydrated(opts: {
    unixDate: number;
    journeySubcategoryInternalName: string;
    amount?: number;
  }) {
    this.incrShareLinkStat({
      ...opts,
      event: 'view_hydrated',
      eventExtra: opts.journeySubcategoryInternalName,
    });
    this.stats.incrDirect('stats:journey_share_links:views:count', opts.amount);
  }

  incrViewHydrationRejected(opts: { unixDate: number; amount?: number }) {
    this.incrShareLinkStat({
      ...opts,
      event: 'view_hydration_rejected',
    });
  }

  incrViewHydrationFailed(opts: {
    unixDate: number;
    ratelimitingApplies: boolean;
    amount?: number;
  }) {
    this.incrShareLinkStat({
      ...opts,
      event: 'view_hydration_failed',
      eventExtra: opts.ratelimitingApplies ? 'novel_code' : 'repeat_code',
    });
  }

  incrViewClientConfirmationRequests(opts: {
    unixDate: number;
    visitorProvided: boolean;
    userProvided: boolean;
    amount?: number;
  }) {
    const vis = opts.visitorProvided ? 'vis_avail' : 'vis_missing';
    const usr = opts.userProvided ? 'user_avail' : 'user_missing';

    this.incrShareLinkStat({
      ...opts,
      event: 'view_client_confirmation_requests',
      eventExtra: `${vis}:${usr}`,
    });
  }

  /**
   * does not increment stats:journey_share_links:unique_views:count - special
   * logic is required.
   */
  incrViewClientConfirmed(opts: {
    unixDate: number;
    extra: ViewClientConfirmedExtra;
    amount?: number;
  }) {
    this.incrShareLinkStat({
      ...opts,
      event: 'view_client_confirmed',
      eventExtra: viewClientConfirmedExtraToEventExtra(opts.extra),
    });
  }

  incrViewClientConfirmFailed(opts: {
    unixDate: number;
    extra: ViewClientConfirmFailedExtra;
    amount?: number;
  }) {
    this.incrShareLinkStat({
      ...opts,
      event: 'view_client_confirm_failed',
      eventExtra: viewClientConfirmFailedExtraToEventExtra(opts.extra),
    });
  }

  incrViewClientFollowRequests(opts: {
    unixDate: number;
    visitorProvided: boolean;
    userProvided: boolean;
    amount?: number;
  }) {
    const vis = opts.visitorProvided ? 'vis_avail' : 'vis_missing';
    const usr = opts.userProvided ? 'user_avail' : 'user_missing';

    this.incrShareLinkStat({
      ...opts,
      event: 'view_client_follow_requests',
      eventExtra: `${vis}:${usr}`,
    });
  }

  /**
   * does not increment stats:journey_share_links:unique_views:count - special
   * logic is required.
   */
  incrViewClientFollowed(opts: {
    unixDate: number;
    journeySubcategoryInternalName: string;
    amount?: number;
  }) {
    this.incrShareLinkStat({
      ...opts,
      event: 'view_client_followed',
      eventExtra: opts.journeySubcategoryInternalName,
    });
  }

  incrViewClientFollowFailed(opts: {
    unixDate: number;
    reason: ViewClientFollowFailedReason;
    amount?: number;
  }) {
    this.incrShareLinkStat({
      ...opts,
      event: 'view_client_follow_failed',
      eventExtra: viewClientFollowFailedReasonToEventExtra(opts.reason),
    });
  }

  /**
   * Not a typical incrby; increments a ratelimiting key, which uses redis
   * expiration to purge old ratelimits. This is your standard bucket-based
   * ratelimiting.
   */
  incrRatelimiting(opts: {
    duration: '1m' | '10m';
    at: number;
    category: string;
    expireAt: number;
    amount?: number;
  }) {
    const key = `journey_share_links:ratelimiting:${opts.duration}:${opts.at}:${opts.category}`;
    this.stats.incrDirect(key, opts.amount);
    this.stats.setExpiration(key, opts.expireAt, 'latest');
  }
}
