import { ReactElement } from 'react';

export type SharedUnlockedClassProps = {
  /**
   * Primary stable external identifier for the class
   */
  uid: string;

  /**
   * The title, i.e., name of the class
   */
  title: string;

  /**
   * A one-paragraph description of the class
   */
  description: string;

  /**
   * The stylesheets required for this page, created by webpack
   */
  stylesheets: string[];
};

/**
 * Renders the entire HTML page for an unlocked/fully shareable class. The meaningful part
 * is in SharedUnlockedClassContent
 */
export const SharedUnlockedClassApp = (props: SharedUnlockedClassProps): ReactElement => {
  return (
    <html>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width,initial-scale=1" />
        <link rel="stylesheet" href="/fonts.css" />
        {props.stylesheets.map((href, i) => (
          <link key={i} rel="stylesheet" href={href} />
        ))}
        <title>Example</title>
      </head>
      <body>
        <div id="root">
          <SharedUnlockedClassBody {...props} />
        </div>
      </body>
    </html>
  );
};

/**
 * Renders the meaningful content that describes and plays the specific class.
 */
export const SharedUnlockedClassBody = (props: Omit<SharedUnlockedClassProps, 'stylesheets'>) => {
  return (
    <div>
      <h1>{props.title}</h1>
      <p>{props.description}</p>
    </div>
  );
};

export default SharedUnlockedClassApp;
