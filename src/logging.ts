import chalk from 'chalk';

/**
 * Formats the given datetime in our standard way, with coloring.
 *
 * @param now The datetime to format and color
 * @returns The formatted date
 */
export const colorNow = (now?: Date): string => {
  return chalk.green((now ?? new Date()).toLocaleString());
};

/**
 * Formats the given HTTP method in our standard way, with coloring
 *
 * @param method The HTTP method to format and color
 * @returns The formatted HTTP method
 */
export const colorHttpMethod = (method: string | undefined): string => {
  if (method === undefined) {
    return chalk.yellowBright('UNKNOWN');
  }
  switch (method) {
    case 'GET':
      return chalk.cyanBright(method);
    case 'POST':
      return chalk.yellow(method);
    case 'PUT':
      return chalk.blue(method);
    case 'DELETE':
      return chalk.red(method);
    default:
      return method;
  }
};

/**
 * Formats the given HTTP status code in our standard way, with coloring
 *
 * @param code The HTTP status code to format and color
 * @param message The HTTP status message to format and color
 * @returns The formatted HTTP status code and message
 */
export const colorHttpStatus = (code: number | undefined, message: string | undefined): string => {
  if (code === undefined || message === undefined) {
    return chalk.yellowBright(`${code ?? 'UNKNOWN'} ${message ?? 'UNKNOWN'}`);
  }

  if (code < 200) {
    return chalk.white(`${code} ${message}`);
  } else if (code >= 200 && code < 300) {
    return chalk.greenBright(`${code} ${message}`);
  } else if (code >= 300 && code < 400) {
    return chalk.yellow(`${code} ${message}`);
  } else if (code >= 400 && code < 500) {
    return chalk.yellowBright(`${code} ${message}`);
  } else {
    return chalk.redBright(`${code} ${message}`);
  }
};
