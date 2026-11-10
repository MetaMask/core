import type { ApiPlatformClient, FetchOptions } from '@metamask/core-backend';

import { divideIntoBatches } from '../data-sources/evm-rpc-services/utils/batch.js';
import { fetchWithTimeout } from './fetchWithTimeout.js';

/** Max asset IDs per Token API request. */
const BATCH_SIZE = 50;

/** Token API result type for tokens Blockaid classifies as malicious. */
const MALICIOUS_RESULT_TYPE = 'malicious';

/**
 * Finds which of the given assets are launchpad tokens that are safe to keep.
 *
 * Launchpad tokens have few aggregator occurrences by nature, so they would
 * otherwise be removed by the occurrence-floor spam filter. A token qualifies
 * when Token API `/v2/assets` returns launchpad data for it and its security
 * data does not classify it as malicious. Errors propagate so callers decide
 * whether to fail open or closed.
 *
 * @param options - Options.
 * @param options.assetIds - CAIP-19 asset IDs to check.
 * @param options.apiClient - API client exposing the Token API.
 * @param options.timeoutMs - Timeout for the request.
 * @param options.fetchOptions - Cache overrides for the request.
 * @returns Lower-cased asset IDs of non-malicious launchpad tokens.
 */
export async function findLaunchpadAssetIds({
  assetIds,
  apiClient,
  timeoutMs,
  fetchOptions,
}: {
  assetIds: string[];
  apiClient: Pick<ApiPlatformClient, 'token'>;
  timeoutMs: number;
  fetchOptions?: FetchOptions;
}): Promise<Set<string>> {
  if (assetIds.length === 0) {
    return new Set();
  }

  const assets = [];
  for (const batch of divideIntoBatches(assetIds, { batchSize: BATCH_SIZE })) {
    assets.push(
      ...(await fetchWithTimeout(
        () =>
          apiClient.token.fetchV2Assets(
            batch,
            { includeLaunchpadData: true, includeTokenSecurityData: true },
            fetchOptions,
          ),
        timeoutMs,
      )),
    );
  }

  return new Set(
    assets
      .filter(
        (asset) =>
          Boolean(asset.launchpad ?? asset.launchpadData) &&
          asset.securityData?.resultType?.toLowerCase() !==
            MALICIOUS_RESULT_TYPE,
      )
      .map((asset) => asset.assetId.toLowerCase()),
  );
}
