/**
 * Request client backing the generated Price API query-core bindings (see
 * `src/generated/price-api/queries`).
 */

import { API_URLS, BaseApiClient } from '../base-client';
import type { ApiRequestArgs, ApiRequestClient } from '../query-runtime';

/**
 * An {@link ApiRequestClient} for the Price API, backed by the shared
 * `BaseApiClient` transport (auth headers, retries and caching included).
 *
 * Use it with the generated query-core bindings:
 *
 * ```ts
 * import { PricesApiRequestClient } from '@metamask/core-backend';
 * import { fetchV3SpotPrices } from '@metamask/core-backend/price-api';
 *
 * const client = new PricesApiRequestClient({ clientProduct: 'metamask-extension' });
 * const prices = await fetchV3SpotPrices(client, {
 *   assetIds: 'eip155:1/slip44:60',
 * });
 * ```
 */
export class PricesApiRequestClient
  extends BaseApiClient
  implements ApiRequestClient
{
  /**
   * Perform a request against the Price API.
   *
   * Note: the shared `BaseApiClient` transport only issues GET requests, so
   * the `method` of the request is currently ignored. All Price API
   * operations are GETs.
   *
   * @param args - The request to perform.
   * @returns The parsed JSON response.
   */
  async request<ResponseType>({
    url,
    params,
    signal,
  }: ApiRequestArgs): Promise<ResponseType> {
    return this.fetch<ResponseType>(API_URLS.PRICES, url, { signal, params });
  }
}
