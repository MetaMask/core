import { handleFetch } from '@metamask/controller-utils';

import type { GetBalancesQueryParams, GetBalancesResponse } from './types';

const MULTICHAIN_ACCOUNTS_DOMAIN = 'https://accounts.api.cx.metamask.io';

const getBalancesUrl = (address: string) =>
  `${MULTICHAIN_ACCOUNTS_DOMAIN}/v2/accounts/${address}/balances`;

/**
 * Fetches Balances for multiple networks.
 * @param address - address to fetch balances from
 * @param options - params to pass down for a more refined search
 * @returns a Balances Response
 */
export async function fetchMultiChainBalances(
  address: string,
  options?: GetBalancesQueryParams,
) {
  const url = new URL(getBalancesUrl(address));
  if (options?.networks !== undefined) {
    url.searchParams.append('networks', options.networks);
  }
  if (options?.filterSupportedTokens !== undefined) {
    url.searchParams.append(
      'filterSupportedTokens',
      String(options.filterSupportedTokens),
    );
  }
  if (options?.includeTokenAddresses !== undefined) {
    url.searchParams.append(
      'includeTokenAddresses',
      options.includeTokenAddresses,
    );
  }
  if (options?.includeStakedAssets !== undefined) {
    url.searchParams.append(
      'includeStakedAssets',
      String(options.includeStakedAssets),
    );
  }

  // TODO - swap handleFetch with raw fetch
  // We may want to handle 429 (Too Many Requests) Rate Limit separately
  const response: GetBalancesResponse = await handleFetch(url);
  return response;
}
