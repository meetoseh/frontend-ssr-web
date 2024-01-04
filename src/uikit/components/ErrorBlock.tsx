import { PropsWithChildren, ReactElement } from 'react';
import styles from './ErrorBlock.module.css';

/**
 * The standard way of putting an error into a form. Usually goes right
 * above the button and has a fragment of text.
 *
 * Called ErrorBlock so as not to conflict with the built-in Error type.
 */
export const ErrorBlock = ({ children }: PropsWithChildren<{}>): ReactElement => {
  return <div className={styles.container}>{children}</div>;
};

/**
 * Checks if the response object has a standard format. If it does, parses it
 * and returns a fragment describing the error. Otherwise, returns a generic
 * error message.
 */
export const describeErrorFromResponse = async (response: Response): Promise<ReactElement> => {
  let body: any = null;
  try {
    body = await response.json();
  } catch (e) {}

  if (response.status === 422 && body?.detail) {
    // fastapi validation error
    return (
      <div>
        There was an issue with the client that sent the request. Contact support with the following
        information:
        <ul>
          {body.detail.map((detail: { loc: string[]; msg: string; type: string }) => (
            <div key={detail.loc.join('.')}>
              {detail.loc.join('.')}: {detail.msg}
            </div>
          ))}
        </ul>
      </div>
    );
  }

  if (body?.message) {
    return <p>{body?.message}</p>;
  }

  return (
    <p>
      There was an error. Please try again later ({response.status} {response.statusText})
    </p>
  );
};

/**
 * Does the best it can to describe an error in a human readable way.
 */
export const describeError = async (e: any): Promise<ReactElement> => {
  if (e instanceof TypeError) {
    return <>Failed to connect to server. Check your internet connection.</>;
  } else if (e instanceof Response) {
    return describeErrorFromResponse(e);
  } else {
    return <>Unknown error. Contact support at hi@oseh.com</>;
  }
};
