/**
 * Returns the resulting color when a solid background color
 * is blended on top of a transparent foreground color.
 *
 * Both numbers should be specified as 0-1 rgb[a] values.
 *
 * @param background The background color to blend on top of.
 * @param foreground The foreground color to blend, with alpha
 */
export const alphaBlend = (
  background: [number, number, number],
  foreground: [number, number, number, number]
): [number, number, number] => [
  (1 - foreground[3]) * background[0] + foreground[3] * foreground[0],
  (1 - foreground[3]) * background[1] + foreground[3] * foreground[1],
  (1 - foreground[3]) * background[2] + foreground[3] * foreground[2],
];

let slowB64Table: Uint8Array | number[] | undefined = undefined;

/**
 * Converts a base64url encoded string to the corresponding bytes.
 * This is useful when working with thumbhashes. This usually uses
 * a fast implementation, but if the necessary APIs are not available
 * a slow javascript implementation is used.
 */
export const base64URLToByteArray = (base64Url: string): Uint8Array | number[] => {
  if (
    window.TextEncoder &&
    window.Uint8Array &&
    (process.env.REACT_APP_ENVIRONMENT !== 'dev' || Math.random() < 0.5)
  ) {
    const binString = atob(base64Url.replace(/-/g, '+').replace(/_/g, '/'));
    return Uint8Array.from(binString, (c) => c.charCodeAt(0));
  }

  if (slowB64Table === undefined) {
    const table = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
    const tableLookup = window.Uint8Array
      ? new window.Uint8Array(256)
      : (() => {
          const res: number[] = [];
          for (let i = 0; i < 256; i++) {
            res.push(0);
          }
          return res;
        })();

    for (let i = 0; i < table.length; i++) {
      tableLookup[table.charCodeAt(i)] = i;
    }

    slowB64Table = tableLookup;
  }

  const lookup = slowB64Table;
  const result: number[] = [];

  const numFullSegments = Math.floor(base64Url.length / 4);
  for (let segment = 0; segment < numFullSegments; segment++) {
    const sextet1 = lookup[base64Url.charCodeAt(segment * 4 + 0)];
    const sextet2 = lookup[base64Url.charCodeAt(segment * 4 + 1)];
    const sextet3 = lookup[base64Url.charCodeAt(segment * 4 + 2)];
    const sextet4 = lookup[base64Url.charCodeAt(segment * 4 + 3)];

    const octet1 = (sextet1 << 2) | (sextet2 >> 4);
    const octet2 = ((sextet2 & 0xf) << 4) | (sextet3 >> 2);
    const octet3 = ((sextet3 & 0x3) << 6) | sextet4;

    result.push(octet1);
    result.push(octet2);
    result.push(octet3);
  }

  if (numFullSegments * 4 !== base64Url.length) {
    const sextet1 = lookup[base64Url.charCodeAt(numFullSegments * 4 + 0)];
    const sextet2 = lookup[base64Url.charCodeAt(numFullSegments * 4 + 1)] ?? 0;
    const sextet3 = lookup[base64Url.charCodeAt(numFullSegments * 4 + 2)] ?? 0;

    const octet1 = (sextet1 << 2) | (sextet2 >> 4);
    const octet2 = ((sextet2 & 0xf) << 4) | (sextet3 >> 2);
    const octet3 = (sextet3 & 0x3) << 6;

    result.push(octet1);
    result.push(octet2);
    result.push(octet3);
  }

  return result;
};

/**
 * Computes an images average color using the base64url encoded thumbhash,
 * which includes the average color.
 *
 * @param thumbhash The thumbhash bytes
 * @returns The average color of the image as a 0-1 rgba value.
 */
export const computeAverageRGBAUsingThumbhash = (
  thumbhash: Uint8Array | number[]
): [number, number, number, number] => {
  // just using the provided python implementation for reference
  // https://github.com/justinforlenza/thumbhash-py/blob/main/thumbhash/__init__.py#L141

  const header = thumbhash[0] | (thumbhash[1] << 8) | (thumbhash[2] << 16);
  const l = (header & 63) / 63.0;
  const p = ((header >> 6) & 63) / 31.5 - 1.0;
  const q = ((header >> 12) & 63) / 31.5 - 1.0;
  const hasAlpha = header >> 23 !== 0;
  const a = hasAlpha ? (thumbhash[5] & 15) / 15.0 : 1.0;
  const b = l - (2.0 / 3.0) * p;
  const r = (3.0 * l - b + q) / 2.0;
  const g = r - q;

  return [
    Math.max(Math.min(1.0, r), 0.0),
    Math.max(Math.min(1.0, g), 0.0),
    Math.max(Math.min(1.0, b), 0.0),
    a,
  ];
};
