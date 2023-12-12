import { IncomingMessage } from 'http';

const regexCharactersRequiringEscape = new Set('.^$*+-?()[]{}\\|');

/**
 * A function which accepts an expected path suffix (e.g., /foo) and returns
 * a function which accepts a prefix (e.g., /bar) and returns a function that
 * accepts an incoming http request and returns true if the request's url
 * matches the suffix, false otherwise.
 *
 * Note that this does not verify the prefix, since it's assumed to be verified
 * already.
 *
 * This returns a valid `path` function for use in a route, as the prefix will
 * have been checked already by the router to know which route to test.
 *
 * The returned function avoids egregious string copying common to most naive
 * implementations. The full impact is unlikely to show with naive benchmarking,
 * as the benefits of reduced copying are generally realized system-wide rather
 * than within individual components (i.e., going a little further before a
 * garbage collection, or squeezing a bit more into the cache line)
 *
 * PERF:
 *   This should only be used if query parameter support is required for an
 *   endpoint, since otherwise it's faster to use a dictionary lookup to find
 *   the route
 *
 * @param suffix The expected path suffix, e.g., /foo
 * @param allowQueryParameters If true, the suffix may be followed by a query
 *   string, which is not validated at all. If false, no query parameters are
 *   allowed and the returned function is slightly faster, especially for non
 *   matches which include the correct suffix.
 * @returns The corresponding route path implementation
 */
export const concretePath = (
  suffix: string,
  allowQueryParameters: boolean = false
): ((prefix: string) => (url: string) => boolean) => {
  return (prefix) => {
    const prefixLength = prefix.length;
    const suffixRegexRaw: string[] = [];
    for (const char of suffix) {
      if (regexCharactersRequiringEscape.has(char)) {
        suffixRegexRaw.push('\\');
      }
      suffixRegexRaw.push(char);
    }
    suffixRegexRaw.push('$');
    const suffixLength = suffix.length;
    const suffixRegex = new RegExp(suffixRegexRaw.join(''));

    if (!allowQueryParameters) {
      return (url) => {
        return url.length - prefixLength === suffixLength && suffixRegex.test(url);
      };
    }

    suffixRegexRaw.pop();
    suffixRegexRaw.push('(\\?.*)?$');
    const suffixRegexWithQuery = new RegExp(suffixRegexRaw.join(''));

    return (url) => {
      return url.length - prefixLength >= suffixLength && suffixRegexWithQuery.test(url);
    };
  };
};

/**
 * Tests if the given part of the url matches a template parameter. Template parameters
 * are restricted to path components separated by forward slashes, so the start and stop
 * is known without needing to parse the url.
 */
export type GenericTemplateParameterParsingStrategy = (
  url: string,
  startsAt: number,
  endsAt: number
) => boolean;

const commonTemplateParameterParsingStrategies = {
  /**
   * Parses a resource identifier, which is a string of 4 to 255 characters.
   */
  uid: (url: string, startsAt: number, endsAt: number): boolean => {
    return endsAt - startsAt >= 4 && endsAt - startsAt <= 255;
  },

  /**
   * Parses a uint32, i.e., a number between 0 and 2^32 - 1, inclusive,
   * in decimal format without commas. (so, e.g, 5059102). Leading zeros
   * are disallowed
   */
  uint32: (url: string, startsAt: number, endsAt: number): boolean => {
    if (endsAt - startsAt < 1 || endsAt - startsAt > 10) {
      return false;
    }
    if (url.charCodeAt(startsAt) === 48 && endsAt - startsAt !== 1) {
      return false;
    }

    for (let i = startsAt; i < endsAt; i++) {
      const charCode = url.charCodeAt(i);
      if (charCode < 48 || charCode > 57) {
        return false;
      }
    }

    if (endsAt - startsAt === 10) {
      // we'll slow path this unlikely case
      if (parseInt(url.slice(startsAt, endsAt), 10) > 4294967295) {
        return false;
      }
    }

    return true;
  },

  /**
   * Parses a uint53, i.e., a number between 0 and 2^53 - 1, inclusive,
   * in decimal format without commas. (so, e.g, 5059102). Leading zeros
   * are disallowed.
   *
   * This is the largest safe integer available in javascript as some bits
   * are used for encoding type information.
   */
  uint53: (url: string, startsAt: number, endsAt: number): boolean => {
    if (endsAt - startsAt < 1 || endsAt - startsAt > 16) {
      return false;
    }
    if (url.charCodeAt(startsAt) === 48 && endsAt - startsAt !== 1) {
      return false;
    }

    for (let i = startsAt; i < endsAt; i++) {
      const charCode = url.charCodeAt(i);
      if (charCode < 48 || charCode > 57) {
        return false;
      }
    }

    if (endsAt - startsAt === 16) {
      // slow path for this unlikely case. We have to be careful to not
      // actually attempt to parse the value as it might not be safe
      const maxValueStr = '9007199254740991';
      for (let i = 0; i < maxValueStr.length; i++) {
        const actualCharCode = url.charCodeAt(i + startsAt);
        const maxAcceptableCharCode = maxValueStr.charCodeAt(i);

        if (actualCharCode > maxAcceptableCharCode) {
          return false;
        }
        if (actualCharCode < maxAcceptableCharCode) {
          break;
        }
      }
    }

    return true;
  },
} as const;

export type TemplateParameterParsingStrategy =
  | keyof typeof commonTemplateParameterParsingStrategies
  | GenericTemplateParameterParsingStrategy;

/**
 * A function which accepts a series of path parts, indicated by constant
 * strings (e.g., /foo/) and template parameters (e.g., a resource identifier).
 * The constant strings must all lead with a forward slash, and the template
 * must end with a constant string.
 *
 * Returns two function generators, both of which accept the route prefix. The
 * first is the path function, which checks if a request matches the route. The
 * second is the parameter extractor function, which extracts the values of the
 * template parameters from the request.
 *
 * This is not as powerful as full regex approach, but covers all sane use cases
 * while making it difficult to accidentally introduce a denial of service
 * opportunity, which is a common vulnerability in regex based approaches.
 *
 * NOTE:
 *   The extractor assumes that the validator already passed and will not double
 *   check the validity of the url. If the validator would not pass, the extractors
 *   behavior is undefined.
 *
 * Example:
 *
 * ```ts
 * const [path, extractor] = templatedPath(['/foo/', 'uid', '/'])
 * ```
 *
 * @param templatedSuffix The suffix of the path, which may contain template parameters. Must end
 *   on a constant string, usually just a forward slash, for faster parsing.
 * @param allowQueryParameters If true, a query string is allowed in the url and not validated,
 *   otherwise, the url must not contain a query string to match
 */
export const templatedPath = (
  templatedSuffix: (string | TemplateParameterParsingStrategy)[],
  allowQueryParameters = false
): [
  (prefix: string) => (url: string) => boolean,
  (prefix: string) => (url: string) => string[],
] => {
  const substitutedSuffix: (string | GenericTemplateParameterParsingStrategy)[] =
    templatedSuffix.map((part) => {
      if (typeof part === 'string') {
        if (part.length === 0) {
          throw new Error('templated path cannot contain empty string');
        }

        if (part in commonTemplateParameterParsingStrategies) {
          return commonTemplateParameterParsingStrategies[
            part as keyof typeof commonTemplateParameterParsingStrategies
          ];
        }

        if (part[0] !== '/') {
          throw new Error('templated path fixed components must start with /');
        }
        return part;
      }
      return part;
    });

  if (substitutedSuffix.length === 0) {
    throw new Error('templated path must contain at least one component');
  }

  if (typeof substitutedSuffix[substitutedSuffix.length - 1] !== 'string') {
    throw new Error('templated path must end with a fixed component');
  }

  const minSuffixLength = substitutedSuffix.reduce(
    (acc, part) => acc + (typeof part === 'string' ? part.length : 0),
    0
  );

  const numberOfDynamicParts = substitutedSuffix.reduce(
    (acc, part) => acc + (typeof part !== 'string' ? 1 : 0),
    0
  );

  return [
    (prefix) => {
      const prefixLength = prefix.length;

      return (url) => {
        if (url.length < prefixLength + minSuffixLength) {
          return false;
        }

        let parsedUpTo = prefixLength;
        for (let partIndex = 0; partIndex < substitutedSuffix.length; partIndex++) {
          const part = substitutedSuffix[partIndex];
          if (typeof part === 'string') {
            for (let partSubIndex = 0; partSubIndex < part.length; partSubIndex++) {
              if (url.charCodeAt(parsedUpTo) !== part.charCodeAt(partSubIndex)) {
                return false;
              }
              parsedUpTo++;
            }
          } else {
            const nextSlashStartsAt = url.indexOf('/', parsedUpTo);
            if (nextSlashStartsAt < 0) {
              return false;
            }
            if (!part(url, parsedUpTo, nextSlashStartsAt)) {
              return false;
            }
            parsedUpTo = nextSlashStartsAt;
          }
        }

        if (parsedUpTo === url.length) {
          return true;
        }

        return allowQueryParameters && url[parsedUpTo] === '?';
      };
    },
    (prefix) => {
      const prefixLength = prefix.length;

      return (url) => {
        const result: string[] = new Array(numberOfDynamicParts);

        let parsedUpTo = prefixLength;
        let resultIndex = 0;
        for (let partIndex = 0; partIndex < substitutedSuffix.length; partIndex++) {
          const part = substitutedSuffix[partIndex];
          if (typeof part === 'string') {
            parsedUpTo += part.length;
            continue;
          }

          const nextSlashStartsAt = url.indexOf('/', parsedUpTo);
          result[resultIndex++] = url.slice(parsedUpTo, nextSlashStartsAt);
          parsedUpTo = nextSlashStartsAt;
        }

        return result;
      };
    },
  ];
};
