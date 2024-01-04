import { RqliteConnection } from 'rqdb';
import { Callbacks } from '../uikit/lib/Callbacks';
import { AsyncLock, createLock } from './createLock';

/**
 * Lazily initialized integrations to just about everything. Should only be
 * initialized using withItgs, with caution to ensure the reference does not
 * leak
 */
class Itgs {
  private _rqdb: RqliteConnection | undefined;
  private readonly lock: AsyncLock;
  private cleanedUp: boolean;
  private readonly cleanup: Callbacks<undefined>;

  constructor() {
    this.cleanedUp = false;
    this.cleanup = new Callbacks();
    this.lock = createLock();
  }

  /**
   * Retrieves connection to the RQLite cluster, our database
   */
  async conn(): Promise<RqliteConnection> {
    this.checkClosed();

    if (this._rqdb === undefined) {
      await this.lock.runSyncWithLock(() => {
        if (this.cleanedUp || this._rqdb !== undefined) {
          return;
        }

        const rqliteIpsRaw = process.env.RQLITE_IPS;
        if (rqliteIpsRaw === undefined) {
          throw new Error('Missing environment variable RQLITE_IPS');
        }

        const rqliteIps = rqliteIpsRaw.split(',');
        const rqliteHosts = rqliteIps.map((ip) => `http://${ip}:4001`);

        this._rqdb = new RqliteConnection(rqliteHosts);
      }).promise;
      this.checkClosed();
      if (this._rqdb === undefined) {
        throw new Error('Unexpected undefined _rqdb');
      }
    }

    return this._rqdb;
  }

  private checkClosed() {
    if (this.cleanedUp) {
      throw new Error('Cannot access conn after close');
    }
  }

  /**
   * Closes any unmanaged resources created by this instance. This
   * is called automatically by withItgs.
   *
   * After this is called, all getters will error.
   */
  async close() {
    if (this.cleanedUp) {
      return;
    }

    this.cleanedUp = true;
    await this.lock.runSyncWithLock(() => {
      this.cleanup.call(undefined);
    }).promise;
  }
}

export type { Itgs };

/**
 * Invokes the given function with an integrations instance which is closed
 * once the promise resolves or rejects. The function must be careful not
 * to leak the integrations instance.
 */
export const withItgs = async <T>(fn: (itgs: Itgs) => Promise<T>): Promise<T> => {
  const itgs = new Itgs();
  try {
    return await fn(itgs);
  } finally {
    await itgs.close();
  }
};
