import { timeoutFetch } from '../util';

/**
 * Fetches the token list from api
 *
 * @returns - Promise resolving to exchange rate for given currency
 */
export async function fetchTokenList(): Promise<Response> {
  const url = `https://metaswap-api.airswap-dev.codefi.network/tokens`;
  const fetchOptions: RequestInit = {
    referrer: url,
    referrerPolicy: 'no-referrer-when-downgrade',
    method: 'GET',
    mode: 'cors',
  };
  // if (!fetchOptions.headers || !(fetchOptions.headers instanceof window.Headers)) {
  //   fetchOptions.headers = new window.Headers(fetchOptions.headers);
  // }
  fetchOptions.headers = new window.Headers();
  fetchOptions.headers.set('Content-Type', 'application/json');
  const tokenResponse = await timeoutFetch(url, fetchOptions);
  return await tokenResponse.json();
}
