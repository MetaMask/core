import { assert } from '@metamask/superstruct';
import type { CaipAccountId } from '@metamask/utils';
import { chunk } from 'lodash';

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

  readonly #batchSize: number;

  constructor({
    fetch: fetchFunction,
    batchSize,
  }: {
    fetch: typeof fetch;
    batchSize?: number;
  }) {
    this.#fetch = fetchFunction;
    this.#batchSize = batchSize ?? 20;
  }

  /**
   * Fetches active networks for the given account IDs.
   * Automatically handles batching requests to comply with URL length limitations.
   *
   * @param accountIds - Array of CAIP-10 account IDs to fetch activity for.
   * @returns Promise resolving to the combined active networks response.
   * @throws Error if the response format is invalid or the request fails.
   */
  async fetchNetworkActivity(
    accountIds: CaipAccountId[],
  ): Promise<ActiveNetworksResponse> {
    if (accountIds.length === 0) {
      return { activeNetworks: [] };
    }

    if (accountIds.length <= this.#batchSize) {
      return this.#fetchNetworkActivityBatch(accountIds);
    }

    const batches = chunk(accountIds, this.#batchSize);
    const batchResults = await Promise.all(
      batches.map((batch) => this.#fetchNetworkActivityBatch(batch)),
    );

    const combinedResponse: ActiveNetworksResponse = {
      activeNetworks: batchResults.flatMap(
        (response) => response.activeNetworks,
      ),
    };

    return combinedResponse;
  }

  /**
   * Internal method to fetch a single batch of account IDs.
   *
   * @param accountIds - Batch of account IDs to fetch
   * @returns Promise resolving to the active networks response for this batch
   * @throws Error if the response format is invalid or the request fails
   */
  async #fetchNetworkActivityBatch(
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
