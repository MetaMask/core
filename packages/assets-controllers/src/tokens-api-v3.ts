import { convertHexToDecimal, handleFetch } from '@metamask/controller-utils';
import type { Hex } from '@metamask/utils';

import type { TokenRwaData } from './token-service';

export const TOKENS_API_V3_BASE_URL = 'https://tokens.api.cx.metamask.io/v3';

/**
 * Maximum number of asset IDs per API request. Requests with more IDs are
 * split into parallel batches of this size.
 */
export const MAX_BATCH_SIZE = 25;

/**
 * The minimum number of occurrences (aggregator listings) a token must have to
 * be considered verified. Tokens below this threshold are treated as potential
 * spam and excluded from detection results.
 */
export const MIN_OCCURRENCES = 3;

export type TokenV3Asset = {
  assetId: string;
  decimals: number;
  iconUrl: string;
  name: string;
  symbol: string;
  occurrences: number;
  aggregators?: string[];
  rwaData?: TokenRwaData;
};

// In-flight deduplication so parallel callers for the same batch share a
// single HTTP request.
const inFlight = new Map<string, Promise<TokenV3Asset[]>>();

/**
 * Fetch a single batch of token metadata from the v3 API.
 *
 * @param assetIds - CAIP-19 asset IDs for this batch (max {@link MAX_BATCH_SIZE}).
 * @returns Resolved token assets returned by the API.
 */
async function fetchTokenBatch(assetIds: string[]): Promise<TokenV3Asset[]> {
  const key = assetIds.join(',');

  const existing = inFlight.get(key);
  if (existing) {
    return existing;
  }

  const params = new URLSearchParams({
    assetIds: assetIds.join(','),
    includeOccurrences: 'true',
    includeIconUrl: 'true',
    includeAggregators: 'true',
    includeRwaData: 'true',
  });

  const promise = (async () => {
    try {
      const data = (await handleFetch(
        `${TOKENS_API_V3_BASE_URL}/assets?${params}`,
      )) as TokenV3Asset[];
      return Array.isArray(data) ? data : [];
    } finally {
      inFlight.delete(key);
    }
  })();

  inFlight.set(key, promise);
  return promise;
}

/**
 * Fetch token metadata from the v3 tokens API for the given asset IDs,
 * splitting large inputs into parallel batches of at most {@link MAX_BATCH_SIZE}.
 *
 * @param assetIds - CAIP-19 asset IDs to fetch.
 * @returns All resolved token assets across all batches.
 */
async function fetchTokenAssets(assetIds: string[]): Promise<TokenV3Asset[]> {
  const batches: string[][] = [];
  for (let i = 0; i < assetIds.length; i += MAX_BATCH_SIZE) {
    batches.push(assetIds.slice(i, i + MAX_BATCH_SIZE));
  }
  const results = await Promise.all(batches.map(fetchTokenBatch));
  return results.flat();
}

/**
 * Build a CAIP-19 ERC-20 asset ID from a chain ID and a token address.
 *
 * @param chainId - Hex chain ID (e.g. `0x1`).
 * @param tokenAddress - ERC-20 contract address (any casing).
 * @returns CAIP-19 asset ID string, e.g. `eip155:1/erc20:0xabc...`.
 */
export function buildCaipAssetId(chainId: Hex, tokenAddress: string): string {
  const decimalChainId = convertHexToDecimal(chainId);
  return `eip155:${decimalChainId}/erc20:${tokenAddress.toLowerCase()}`;
}

/**
 * Fetch token metadata for the given ERC-20 addresses on a specific chain,
 * filtering out tokens that do not meet the minimum occurrences threshold
 * (spam filter).
 *
 * Results are keyed by lowercase token address for easy lookup.
 *
 * @param chainId - Hex chain ID.
 * @param tokenAddresses - ERC-20 token addresses to look up.
 * @returns Map from lowercase token address to verified token asset data.
 */
export async function fetchVerifiedTokensByAddresses(
  chainId: Hex,
  tokenAddresses: string[],
): Promise<Map<string, TokenV3Asset>> {
  if (tokenAddresses.length === 0) {
    return new Map();
  }

  const assetIds = tokenAddresses.map((address) =>
    buildCaipAssetId(chainId, address),
  );

  const assets = await fetchTokenAssets(assetIds);

  const result = new Map<string, TokenV3Asset>();
  for (const asset of assets) {
    if (asset.occurrences >= MIN_OCCURRENCES) {
      // Extract the address part from the CAIP-19 ID: "eip155:1/erc20:0xabc" → "0xabc"
      const address = asset.assetId.split('/erc20:')[1]?.toLowerCase();
      if (address) {
        result.set(address, asset);
      }
    }
  }

  return result;
}
