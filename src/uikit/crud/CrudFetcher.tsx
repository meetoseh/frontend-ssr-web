import { Dispatch, SetStateAction } from 'react';
import { LoginContextValueLoggedIn } from '../contexts/LoginContext';
import { apiFetch } from '../ApiConstants';

type MappedKey<T> = {
  key: string & keyof T;
  value: any;
};

export type CrudFetcherKeyMap<T> = {
  [key: string]: (string & keyof T) | ((key: string, value: any) => MappedKey<T>);
};
type SortItem = {
  key: string;
  dir: 'asc' | 'desc';
  before: any;
  after: any;
};

export type CrudFetcherSort = SortItem[];

type FilterItem = {
  operator: string;
  value: any;
};

export type CrudFetcherFilter = { [key: string]: FilterItem };

/**
 * Converts a raw object from the api into a typed object using the
 * given key map
 *
 * @param raw The raw object to convert
 * @param keyMap The key map to use
 * @returns The converted object
 */
export function convertUsingKeymap<T>(raw: any, keyMap: CrudFetcherKeyMap<T>): T {
  const result: any = {};
  for (const key in raw) {
    if (key in keyMap) {
      const value = keyMap[key];
      if (typeof value === 'string') {
        result[value] = raw[key];
      } else {
        const mapped = value(key, raw[key]);
        result[mapped.key] = mapped.value;
      }
    } else {
      result[key] = raw[key];
    }
  }
  return result as T;
}

function getNextPageSort(
  nextOrPrevPageSort: CrudFetcherSort | null | undefined
): CrudFetcherSort | null {
  if (nextOrPrevPageSort === null || nextOrPrevPageSort === undefined) {
    return null;
  }

  if (!nextOrPrevPageSort.some((i) => i.after !== null)) {
    return null;
  }

  return nextOrPrevPageSort;
}

/**
 * This class is capable of fetching items from a standard listing
 * endpoint whose request body has filters, sort, and limit and the
 * response has items, next_page_sort
 *
 * This is typically used to implement the bulk of a useEffect hook
 * which depends on the filters, sort, and limit via the load method,
 * and to provide the onMore handler for a CrudListing component
 *
 * ```ts
 * const loginContextRaw = useContext(LoginContext);
 * const [items, setItems] = useState<MyItem[]>([]);
 * const [filters, setFilters] = useState<MyFilters>(defaultFilters)
 * const [sort, setSort] = useState<MySort>(defaultSort)
 * const [limit, setLimit] = useState<number>(defaultLimit)
 * const [loading, setLoading] = useState(true):
 * const [haveMore, setHaveMore] = useState(true);
 * const fetcher = useMemo(() => {
 *   return new CrudFetcher<MyItem>(path, keyMap, setItems, setLoading, setHaveMore);
 * }, [path, keyMap]); // often empty since these are constants
 *
 * useValueWithCallbacksEffect(
 *   loginContextRaw,
 *   useCallback((loginContext) => {
 *     if (loginContext.state !== 'logged-in') { return; }
 *     return fetcher.resetAndLoadWithCancelCallback(filters, sort, limit, loginContext, (e) => {
 *       console.error(e);
 *     });
 *   }, [fetcher, filters, sort, limit])
 * );
 *
 * const onMore = useCallback(() => {
 *  fetcher.loadMore(filters, limit, loginContext);
 * }, [fetcher, filters, limit, loginContext]);
 * ```
 */
export class CrudFetcher<T> {
  /**
   * The path to the listing endpoint
   */
  private readonly path: string;

  /**
   * Any keys which need to be transformed from the result to get an object of
   * type T. If mapping to a string, it's assumed that the value stays the same,
   * but the key is aliased. If mapping to a function, the function is called
   * with the key and value and should return the new key and value.
   *
   * May instead be a function which takes the raw object and returns the
   * converted object.
   */
  private readonly keyMap: CrudFetcherKeyMap<T> | ((v: any) => T);

  /**
   * The dispatch function to set the items
   */
  private readonly setItems: Dispatch<SetStateAction<T[]>>;

  /**
   * The dispatch function to set the loading state
   */
  private readonly setLoading: Dispatch<SetStateAction<boolean>>;

  /**
   * The dispatch function to set the haveMore state
   */
  private readonly setHaveMore: Dispatch<SetStateAction<boolean>>;

  /**
   * If there are more results, the sort to use to fetch the next page.
   */
  private nextPageSort: CrudFetcherSort | null;

  /**
   * A counter used to ensure we are only performing one request at
   * a time.
   */
  private counter: number;

  /**
   * If there is an active request and AbortController/AbortSignal is
   * supported, this will be set to the AbortController for the request.
   * This saves some resources but is not strictly necessary.
   */
  private abortController: AbortController | null;

  /**
   *
   * @param path The path to the listing endpoint
   * @param keyMap Provides the mapping of any keys which are not returned in
   *   the same format as the type T. If mapping to a string, it's assumed that
   *   the value stays the same, but the key is aliased.
   * @param setItems The dispatch function to set the items.
   * @param setLoading The dispatch function to set the loading state.
   * @param setHaveMore The dispatch function to set the haveMore state, i.e.,
   *   whether there are more items available to load.
   */
  constructor(
    path: string,
    keyMap: CrudFetcherKeyMap<T> | ((v: any) => T),
    setItems: Dispatch<SetStateAction<T[]>>,
    setLoading: Dispatch<SetStateAction<boolean>>,
    setHaveMore: Dispatch<SetStateAction<boolean>>
  ) {
    this.path = path;
    this.keyMap = keyMap;
    this.setItems = setItems;
    this.setLoading = setLoading;
    this.setHaveMore = setHaveMore;

    this.nextPageSort = null;
    this.counter = 0;
    this.abortController = null;
  }

  /**
   * Uses the keyMap to produce an object of type T from the server response
   * @param raw The raw object from the server
   * @returns An object of type T
   */
  private convertItem(raw: any): T {
    if (typeof this.keyMap === 'function') {
      return this.keyMap(raw);
    }

    return convertUsingKeymap(raw, this.keyMap);
  }

  /**
   * The primary implementation for loading items from the server. This is not
   * exposed directly as the cancellation signals (counter, abortController)
   * are managed internally, but if they were created by this function than
   * converting them to e.g. cancel callbacks would be more challenging
   *
   * @param filters The filters to pass to the server
   * @param sort The sort to pass to the server
   * @param limit The maximum number of items to return
   * @param loginContext The login context to use for the request
   * @param id The value that counter should be set to before the request.
   *   If the counter is not equal to this value at any point during the
   *   request, this will return a rejected promise with the value 'aborted'
   * @param signal If provided, can be used to abort the request faster than
   *   id would allow. We will catch the aborted error and convert it to
   *   'aborted' as well.
   * @returns A promise which resolves to the items and the nextPageSort
   *   returned from the server, with the items already transformed to type T
   * @throws 'aborted' if the request was aborted
   * @throws Response if the response was not ok
   */
  private async load(
    filters: CrudFetcherFilter,
    sort: CrudFetcherSort,
    limit: number,
    loginContext: LoginContextValueLoggedIn,
    id: number,
    signal: AbortSignal | null
  ): Promise<{ items: T[]; nextOrPrevPageSort: CrudFetcherSort | null }> {
    const handleAborted = () => {
      if (this.counter !== id || (signal && signal.aborted)) {
        throw new Error('aborted');
      }
    };
    handleAborted();

    let response: Response;
    try {
      response = await apiFetch(
        this.path,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json; charset=utf-8',
          },
          body: JSON.stringify({
            filters,
            sort,
            limit,
          }),
          signal,
        },
        loginContext
      );
    } catch (e: any) {
      if (e !== null && e !== undefined && e.name === 'AbortError') {
        throw new Error('aborted');
      }
      throw e;
    }

    handleAborted();
    if (!response.ok) {
      throw response;
    }

    let json: { items: any[]; next_page_sort: any | null };
    try {
      json = await response.json();
    } catch (e: any) {
      if (e !== null && e !== undefined && e.name === 'AbortError') {
        throw new Error('aborted');
      }
      throw e;
    }
    handleAborted();

    return {
      items: json.items.map((i) => this.convertItem(i)),
      nextOrPrevPageSort: json.next_page_sort || null,
    };
  }

  /**
   * Prepares to make a new request, cancelling the ongoing one (if any),
   * and moving to the loading state
   *
   * @returns An object containing the id to use for the request and the
   *   signal to use for the request
   */
  private initRequest(): { id: number; signal: AbortSignal | null } {
    const id = ++this.counter;
    if (this.abortController !== null) {
      this.abortController.abort();
    }
    this.setLoading(true);

    if (window.AbortController === undefined || window.AbortController === null) {
      return { id, signal: null };
    }

    this.abortController = new AbortController();
    return { id, signal: this.abortController.signal };
  }

  /**
   * Should be called after we've finished the request with the given id,
   * to cleanup the abortController if it's no longer needed and to
   * move to the not loading state
   * @param id The id of the request that just finished
   */
  private postRequest(id: number) {
    if (this.counter === id) {
      this.abortController = null;
      this.setLoading(false);
    }
  }

  /**
   * Loads the next page of items from the server, and updates the state. This
   * will abort any ongoing requests and start a new one.
   *
   * - If the request fails due to a FetchError, this returns a rejected promise
   *   containing the error.
   * - If the request fails because the response was not ok, this returns a
   *   rejected promise containing the response.
   * - If the request is aborted because another request was started, this
   *   returns normally but does not update the state.
   * - If there is no more content to load, this returns normally but does not
   *   update the state.
   *
   * @param filters The filters to pass to the server
   * @param limit The maximum number of items to fetch
   * @param loginContext The login context to use for the request
   * @param kwargs Additional optional keyword arguments
   * @param kwargs.replace Default false. If true, instead of appending
   *   the new items to the end of the list, this will replace the list
   *   with the new items.
   */
  async loadMore(
    filters: CrudFetcherFilter,
    limit: number,
    loginContext: LoginContextValueLoggedIn,
    kwargs: { replace?: boolean } | undefined = undefined
  ): Promise<void> {
    kwargs = Object.assign(
      {},
      {
        replace: false,
      },
      kwargs
    );
    if (this.nextPageSort === null) {
      return;
    }

    const { id, signal } = this.initRequest();
    try {
      const { items, nextOrPrevPageSort } = await this.load(
        filters,
        this.nextPageSort,
        limit,
        loginContext,
        id,
        signal
      );
      if (kwargs.replace) {
        this.setItems(items);
      } else {
        this.setItems((prev) => [...prev, ...items]);
      }
      const nextPageSort = getNextPageSort(nextOrPrevPageSort);
      this.nextPageSort = nextPageSort;
      this.setHaveMore(nextPageSort !== null);
    } catch (e: any) {
      if (e !== null && e !== undefined && e.message === 'aborted') {
        return;
      }
      throw e;
    } finally {
      this.postRequest(id);
    }
  }

  /**
   * Loads the first page of items in the given sort, and updates the state.
   * This will abort any ongoing requests and start a new one.
   *
   * - If the request fails due to a FetchError, this calls the onError callback
   *   with the error.
   * - If the request fails because the response was not ok, this calls the
   *   onError callback with the response.
   * - If the request is aborted because another request was started, this
   *   returns normally but does not update the state.
   *
   * @param filters The filters to pass to the server
   * @param sort The sort to pass to the server
   * @param limit The maximum number of items to fetch
   * @param loginContext The login context to use for the request
   * @param onError A callback to call if the request fails, since this does not
   *   return a promise.
   * @returns A function that can be called to cancel the request
   */
  resetAndLoadWithCancelCallback(
    filters: CrudFetcherFilter,
    sort: CrudFetcherSort,
    limit: number,
    loginContext: LoginContextValueLoggedIn,
    onError: (e: any) => void
  ): () => void {
    const { id, signal } = this.initRequest();
    doRequest.apply(this);
    return () => {
      if (this.counter !== id) {
        return;
      }
      this.counter++;
      if (this.abortController !== null) {
        this.abortController.abort();
        this.abortController = null;
      }
      this.setLoading(false);
    };

    async function doRequest(this: CrudFetcher<T>) {
      try {
        const { items, nextOrPrevPageSort } = await this.load(
          filters,
          sort,
          limit,
          loginContext,
          id,
          signal
        );
        this.setItems(items);
        const nextPageSort = getNextPageSort(nextOrPrevPageSort);
        this.nextPageSort = nextPageSort;
        this.setHaveMore(nextPageSort !== null);
      } catch (e: any) {
        if (e !== null && e !== undefined && e.message === 'aborted') {
          return;
        }
        onError(e);
      } finally {
        this.postRequest(id);
      }
    }
  }
}
