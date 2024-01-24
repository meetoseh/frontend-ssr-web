/**
 * Determines when the JWT expires
 *
 * @param jwt The JWT to check
 * @returns The number of milliseconds since the epoch when the JWT expires
 */
export const getJwtExpiration = (jwt: string): number => {
  const parts = jwt.split('.');
  if (parts.length !== 3) {
    throw new Error('Invalid JWT; incorrect number of parts');
  }

  const claimsBase64 = parts[1];
  const claimsJson = atob(claimsBase64);
  const payload = JSON.parse(claimsJson);
  if (!payload.exp) {
    throw new Error('Invalid JWT; no exp claim');
  }

  return payload.exp * 1000;
};

/**
 * @param jwt The JWT to check
 * @param now The current time in milliseconds since the epoch
 * @returns True if the JWT is expired, false otherwise
 */
export const isJWTExpired = (jwt: string, now: number): boolean => {
  const expiration = getJwtExpiration(jwt);
  return now >= expiration;
};
