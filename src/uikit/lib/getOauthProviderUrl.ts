import { HTTP_API_URL } from '../ApiConstants';

/**
 * Switches urls to go to the /dev_login page instead of the hosted ui
 */
const isDevelopment = (process.env.CLIENT_VISIBLE_ENVIRONMENT ?? process.env.ENVIRONMENT) === 'dev';

/**
 * Gets the url for the given social login provider.
 */
export const getOauthProviderUrl = async (provider: string): Promise<string> => {
  if (isDevelopment && provider !== 'Direct') {
    return '/dev_login';
  }

  const response = await fetch(HTTP_API_URL + '/api/1/oauth/prepare', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({
      provider: provider,
      refresh_token_desired: true,
    }),
  });

  if (!response.ok) {
    throw response;
  }

  const data = await response.json();
  return data.url;
};
