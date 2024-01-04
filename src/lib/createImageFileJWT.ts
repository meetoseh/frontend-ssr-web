import * as jose from 'jose';

const DEFAULT_DURATION = 60 * 30;

/**
 * Creates a new JWT that can be used to access the image with the given uid
 * for the specified duration in seconds (or 30 minutes if not specified).
 */
export const createImageFileJWT = async (
  uid: string,
  opts?: { durationSeconds?: number }
): Promise<string> => {
  const duration = opts?.durationSeconds ?? DEFAULT_DURATION;
  const secret = process.env.OSEH_IMAGE_FILE_JWT_SECRET;
  const now = Math.floor(Date.now() / 1000);

  return new jose.SignJWT({
    sub: uid,
    iss: 'oseh',
    aud: 'oseh-image',
    iat: now - 1,
    exp: now + duration,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .sign(new TextEncoder().encode(secret));
};
