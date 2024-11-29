import { handleFetch } from '@metamask/controller-utils';

import type {
  GetBalancesQueryParams,
  GetBalancesResponse,
  GetSupportedNetworksResponse,
} from './types';

export const MULTICHAIN_ACCOUNTS_DOMAIN = 'https://accounts.api.cx.metamask.io';

const getBalancesUrl = (
  address: string,
  queryParams?: GetBalancesQueryParams,
) => {
  const url = new URL(
    `${MULTICHAIN_ACCOUNTS_DOMAIN}/v2/accounts/${address}/balances`,
  );

  if (queryParams?.networks !== undefined) {
    url.searchParams.append('networks', queryParams.networks);
  }

  return url;
};

/**
 * Fetches Supported Networks.
 * @returns supported networks (decimal)
 */
export async function fetchSupportedNetworks(): Promise<number[]> {
  const url = new URL(`${MULTICHAIN_ACCOUNTS_DOMAIN}/v1/supportedNetworks`);
  const response: GetSupportedNetworksResponse = await handleFetch(url);
  return response.fullSupport;
}

/**
 * Fetches Balances for multiple networks.
 * @param address - address to fetch balances from
 * @param options - params to pass down for a more refined search
 * @param options.networks - the networks (in decimal) that you want to filter by
 * @param platform - indicates whether the platform is extension or mobile
 * @returns a Balances Response
 */
export async function fetchMultiChainBalances(
  address: string,
  options: { networks?: number[] },
  platform: 'extension' | 'mobile',
) {
  const url = getBalancesUrl(address, {
    networks: options?.networks?.join(),
  });
  const response: GetBalancesResponse = await handleFetch(url, {
    headers: {
      'x-metamask-clientproduct': `metamask-${platform}`,
    },
  });
  return response;
}
