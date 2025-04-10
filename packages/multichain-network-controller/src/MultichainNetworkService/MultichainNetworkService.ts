import { assert } from '@metamask/superstruct';
import type { CaipAccountId } from '@metamask/utils';

import {
  type ActiveNetworksResponse,
  ActiveNetworksResponseStruct,
  buildActiveNetworksUrl,
  MULTICHAIN_ACCOUNTS_CLIENT_HEADER,
  MULTICHAIN_ACCOUNTS_CLIENT_ID,
} from '../api/accounts-api';

/**
 * Service responsible for fetching network activity data from the API.
 */
export class MultichainNetworkService {
  readonly #fetch: typeof fetch;

  constructor({ fetch: fetchFunction }: { fetch: typeof fetch }) {
    this.#fetch = fetchFunction;
  }

  /**
   * Fetches active networks for the given account IDs.
   *
   * @param accountIds - Array of CAIP-10 account IDs to fetch activity for.
   * @returns Promise resolving to the active networks response.
   * @throws Error if the response format is invalid or the request fails.
   */
  async fetchNetworkActivity(
    accountIds: CaipAccountId[],
  ): Promise<ActiveNetworksResponse> {
    try {
      const url = buildActiveNetworksUrl(accountIds);

      const response = await this.#fetch(url.toString(), {
        method: 'GET',
        headers: {
          [MULTICHAIN_ACCOUNTS_CLIENT_HEADER]: MULTICHAIN_ACCOUNTS_CLIENT_ID,
          Accept: 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data: unknown = await response.json();

      assert(data, ActiveNetworksResponseStruct);
      return data;
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
}
