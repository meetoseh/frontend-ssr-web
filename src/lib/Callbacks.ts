/**
 * An abstraction for a list of functions to call when an event occurs,
 * with add/remove methods to add and remove functions from the list.
 *
 * This uses a doubly-linked list and a map to allow for O(1) add/remove
 * and O(n) iteration.
 */
export class Callbacks<T> {
  /**
   * The head of the linked list of callbacks, or null if the list is empty
   */
  private head: CallbackNode<T> | null;

  /**
   * The tail of the linked list of callbacks, or null if the list is empty
   */
  private tail: CallbackNode<T> | null;

  /**
   * The map from callbacks to nodes in the linked list, to allow for
   * O(1) remove
   */
  private lookup: Map<(event: T) => void, CallbackNode<T>>;

  /**
   * If call() is currently be executed, i.e., we're in the middle
   * of firing callbacks, if call() gets executed again we will
   * cancel the previous call to avoid the following situation:
   *
   * Suppose there are three listeners, A, B, C, in that order.
   *
   * First call(I) is called, which calls A(I), then B(I), but then
   * B(I) calls call(II). Without extra logic, that would call A(II),
   * then B(II), then C(II), then finally C(I). That means callback
   * C saw II before I, which is not what we want.
   *
   * When the event uses and old/current style, the event which is
   * calling from a callback needs to be careful to use the
   * replaceCall method rather than the call method (we will enforce
   * this), as there will be a split perspective - for callbacks prior
   * to the one doing the replacing, their "old" event is the "current"
   * event, and for callbacks after the one doing the replacing, their
   * "old" event is the "old" event.
   */
  private calling: boolean;
  /**
   * Should always be null unless calling; if specified, it means the call
   * has been replaced and the old call should call this function with
   * the callbacks that it has already called. The last item in alreadyCalled
   * is assumed to be the callback that replaced the call, and it will be
   * skipped
   */
  private callReplacedBy: ((alreadyCalled: ((event: T) => void)[]) => void) | null;

  /**
   * Initializes an empty list of callbacks
   */
  constructor() {
    this.head = null;
    this.tail = null;
    this.lookup = new Map();
    this.calling = false;
    this.callReplacedBy = null;
  }

  /**
   * Adds the given callback to the list
   * @param callback the callback to add
   * @returns true if the callback was added, false if it was already in the list
   */
  add(callback: (event: T) => void): boolean {
    if (this.lookup.has(callback)) {
      return false;
    }

    const node = {
      callback,
      next: null,
      prev: this.tail,
    };

    if (this.tail) {
      this.tail.next = node;
    } else {
      this.head = node;
    }

    this.tail = node;
    this.lookup.set(callback, node);
    return true;
  }

  /**
   * Removes the given callback from the list, if it is in the list
   * @param callback the callback to remove
   * @returns true if the callback was removed, false if it was not in the list
   */
  remove(callback: (event: T) => void): boolean {
    const node = this.lookup.get(callback);
    if (node === undefined) {
      return false;
    }

    /* Case 1: node is the only node in the list */
    if (node.prev === null && node.next === null) {
      this.head = null;
      this.tail = null;
      this.lookup.delete(callback);
      return true;
    }

    /* Case 2: node is the head */
    if (node.prev === null) {
      if (this.head !== node || this.head.next === null) {
        throw new Error('Invariant violation');
      }

      this.head = this.head.next;
      this.head.prev = null;
      this.lookup.delete(callback);
      return true;
    }

    /* Case 3: node is the tail */
    if (node.next === null) {
      if (this.tail !== node || this.tail.prev === null) {
        throw new Error('Invariant violation');
      }

      this.tail = this.tail.prev;
      this.tail.next = null;
      this.lookup.delete(callback);
      return true;
    }

    /* Case 4: node is in the middle */
    const prev = node.prev;
    const nxt = node.next;

    prev.next = nxt;
    nxt.prev = prev;
    this.lookup.delete(callback);
    return true;
  }

  /**
   * Calls each callback in the list with the given event. If, while
   * this is being done, callbacks are added or removed, the changes
   * will not be reflected in the iteration.
   *
   * Furthermore, if, while this is being done, call() gets called again
   * and error will be raised as the operation is ambiguous in many common
   * contexts. Instead, replaceCall() should be used when trying to call
   * call() from a callback.
   *
   * @param event the event to pass to each callback
   */
  call(event: T): void {
    if (this.calling) {
      throw new Error('Cannot call call() while call() is already executing. Use replaceCall()');
    }

    const callbacks = [];
    let node = this.head;
    while (node !== null) {
      callbacks.push(node.callback);
      node = node.next;
    }

    this.calling = true;
    let i = 0;
    while (i < callbacks.length && this.callReplacedBy === null) {
      callbacks[i](event);
      i++;
    }
    this.calling = false;

    if (this.callReplacedBy !== null) {
      const replacedBy = this.callReplacedBy;
      this.callReplacedBy = null;
      replacedBy(callbacks.slice(0, i));
    }
  }

  /**
   * A variant of call() that can be called from a callback. It will
   * invoke all callbacks which are still in the list and have been
   * called so far with the first event, and all callbacks which are
   * still in the list and have not been called so far with the second
   * event.
   *
   * It's strongly recommended that this only be called once by a callback.
   * If called multiple times, only the last call will be honored.
   */
  replaceCall(forPreviousCallbacksEvent: T, forLaterCallbacksEvent: T): void {
    if (!this.calling) {
      throw new Error('Cannot call replaceCall() while call() is not executing');
    }

    this.callReplacedBy = this._doReplaceCall.bind(
      this,
      forPreviousCallbacksEvent,
      forLaterCallbacksEvent
    );
  }

  _doReplaceCall(
    forPreviousCallbacksEvent: T,
    forLaterCallbacksEvent: T,
    alreadyCalled: ((event: T) => void)[]
  ): void {
    const previousCallbacks = [];
    const nextCallbacks = [];

    const alreadyCalledSet = new Set(alreadyCalled);

    let node = this.head;
    while (node !== null) {
      if (alreadyCalledSet.has(node.callback)) {
        previousCallbacks.push(node.callback);
      } else {
        nextCallbacks.push(node.callback);
      }
      node = node.next;
    }

    this.calling = true;
    this.callReplacedBy = null as ((alreadyCalled: ((event: T) => void)[]) => void) | null;
    let i = 0;
    while (i < previousCallbacks.length && this.callReplacedBy === null) {
      if (previousCallbacks[i] === alreadyCalled[alreadyCalled.length - 1]) {
        i++;
        continue;
      }

      previousCallbacks[i](forPreviousCallbacksEvent);
      i++;
    }
    if (this.callReplacedBy !== null) {
      /* We can't support this without a very complicated replaceCall signature */
      this.calling = false;
      this.callReplacedBy = null;
      throw new Error(
        'callbacks replaceCall() on replaced call prior to processing previous callbacks'
      );
    }

    i = 0;
    while (i < nextCallbacks.length && this.callReplacedBy === null) {
      nextCallbacks[i](forLaterCallbacksEvent);
      i++;
    }
    this.calling = false;

    if (
      (this.callReplacedBy as ((alreadyCalled: ((event: T) => void)[]) => void) | null) !== null
    ) {
      const replacedBy = this.callReplacedBy as unknown as (
        alreadyCalled: ((event: T) => void)[]
      ) => void;
      this.callReplacedBy = null;
      replacedBy(previousCallbacks.slice().concat(nextCallbacks.slice(0, i)));
    }
  }

  /**
   * Removes all callbacks from the list
   */
  clear(): void {
    this.head = null;
    this.tail = null;
    this.lookup.clear();
  }
}

type CallbackNode<T> = {
  callback: (event: T) => void;
  next: CallbackNode<T> | null;
  prev: CallbackNode<T> | null;
};

/**
 * Describes an object which can be provided as a react prop to
 * give a value which can be changed without the prop changing.
 *
 * This provides a particularly simple interface, which is preferable
 * in almost all circumstances.
 */
export type ValueWithCallbacks<T> = {
  /**
   * A function which retrieves the current value
   */
  get: () => T;
  /**
   * The callbacks that must be invoked whenever the value changes.
   */
  callbacks: Callbacks<undefined>;
};

export type WritableValueWithCallbacks<T> = ValueWithCallbacks<T> & {
  /**
   * Sets the current value without invoking the callbacks. The
   * callbacks should be invoked separately.
   */
  set: (t: T) => void;
};

/**
 * Similar to useWritableValueWithCallbacks, but not a hook-like function. Returns
 * a new writable value with callbacks, initialized to initial.
 *
 * @param initial the initial value
 * @returns a value with callbacks, initialized to initial
 */
export const createWritableValueWithCallbacks = <T>(initial: T): WritableValueWithCallbacks<T> => {
  let current = initial;
  const callbacks = new Callbacks<undefined>();
  return {
    get: () => current,
    set: (t: T) => {
      current = t;
    },
    callbacks,
  };
};
