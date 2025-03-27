import { handleFetch } from '@metamask/controller-utils';

import { MULTICHAIN_ACCOUNTS_DOMAIN } from './constants';
import type { ActiveNetworksResponse } from './types';

/**
 * Validates CAIP-10 account IDs format.
 *
 * @param accountIds - Array of account IDs to validate
 * @throws Error if any account ID is invalid
 */
function validateAccountIds(accountIds: string[]): void {
  if (!accountIds.length) {
    throw new Error('At least one account ID is required');
  }

  const caip10Regex = /^(eip155|solana):[0-9]+:0x[0-9a-fA-F]{40}$/u;
  const invalidIds = accountIds.filter((id) => !caip10Regex.test(id));

  if (invalidIds.length > 0) {
    throw new Error(
      `Invalid CAIP-10 account IDs: ${invalidIds.join(', ')}. Expected format: <namespace>:<chainId>:<address>`,
    );
  }
}

/**
 * Constructs the URL for the active networks API endpoint.
 *
 * @param accountIds - Array of account IDs
 * @returns URL object for the API endpoint
 */
function buildActiveNetworksUrl(accountIds: string[]): URL {
  const url = new URL(`${MULTICHAIN_ACCOUNTS_DOMAIN}/v2/activeNetworks`);
  url.searchParams.append('accountIds', accountIds.join(','));
  return url;
}

/**
 * Fetches the active networks for given account IDs.
 *
 * @param accountIds - Array of CAIP-10 account IDs with wildcard chain references
 * @returns Promise resolving to the active networks response
 * @throws Error if the request fails or if account IDs are invalid
 */
export async function fetchNetworkActivityByAccounts(
  accountIds: string[],
): Promise<ActiveNetworksResponse> {
  try {
    validateAccountIds(accountIds);

    const url = buildActiveNetworksUrl(accountIds);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);
    const response: ActiveNetworksResponse = await handleFetch(url, {
      signal: controller.signal,
      method: 'GET',
      headers: {
        Accept: 'application/json',
      },
    });

    clearTimeout(timeoutId);

    if (!Array.isArray(response?.activeNetworks)) {
      throw new Error('Invalid response format from active networks API');
    }

    return response;
  } catch (error) {
    if (error instanceof Error) {
      if (error.name === 'AbortError') {
        throw new Error('Request timeout: Failed to fetch active networks');
      }
      throw error;
    }

    throw new Error(`Failed to fetch active networks: ${String(error)}`);
  }
}
