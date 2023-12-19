import { useEffect, useRef } from 'react';
import { PlausibleEventArgs, sendPlausibleEvent } from '../lib/sendPlausibleEvent';

/**
 * A hook-like function which sends a Plausible event when the component is
 * mounted. This can be a bit more efficient than just `sendPlausibleEvent` and
 * is more consistent with how side-effects are typically managed.
 *
 *
 * @param idempotency The idempotency key for this event. If the same key is used
 *   twice in the same page, the second is ignored. Changing this value causes a
 *   new event to be sent.
 * @param args The event to send. The event name and corresponding page url and props
 *  must be documented under docs/plausible/events.md
 */
export const usePlausibleEvent = (idempotency: string, args: PlausibleEventArgs) => {
  const argsRef = useRef(args);
  argsRef.current = args;

  useEffect(() => {
    sendPlausibleEvent(idempotency, argsRef.current);
  }, [idempotency]);
};
