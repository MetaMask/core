import { API_URLS, ApiPlatformClient } from '@metamask/core-backend';
import type { Json } from '@metamask/utils';
import nock, { pendingMocks } from 'nock';

import {
  ARBITRUM_GMX,
  BASE_FARTCOIN,
  BASE_USDC,
  BNB_MUSD,
  MAINNET_MUSD,
  MAINNET_USDT,
  MONAD_WMON,
  OPTIMISM_SPAM,
  OPTIMISM_USDC,
  OPTIMISM_VELO,
  SEI_USDCN,
  SOLANA_USDC,
  findTokenMetadata,
} from './spamWalletState.js';
import { waitFor } from './test-utils.js';

/**
 * `GET token.api.cx.metamask.io/v1/suggestedOccurrenceFloors`, verbatim.
 *
 * Only ten chains are listed. Optimism, Base, Arbitrum and Polygon are not
 * among them and fall back to the sweep's own floor of three, while the newer
 * chains — Monad, Sei, Linea — are held to one, because their token lists are
 * too thin for anything stricter.
 */
export const SUGGESTED_OCCURRENCE_FLOORS: Record<string, number> = {
  '1': 3,
  '143': 1,
  '204': 1,
  '232': 1,
  '690': 1,
  '1329': 1,
  '4663': 1,
  '10143': 1,
  '59144': 1,
  '98866': 1,
};

export const TOKEN_API_OCCURRENCES: Record<string, number | undefined> = {
  [MAINNET_MUSD]: 5,
  [MAINNET_USDT]: 10,
  [OPTIMISM_USDC]: 7,
  [OPTIMISM_VELO]: 6,
  [BASE_USDC]: 8,
  [BASE_FARTCOIN]: 3, // exactly the floor Base falls back to
  [SEI_USDCN]: 2, // under the fallback floor, over Sei's suggested one
  [ARBITRUM_GMX]: 9,
  [SOLANA_USDC]: 4,
  [OPTIMISM_SPAM]: 2, // a scam token that talked its way onto two lists
  [MONAD_WMON]: undefined, // as the API answers for every Monad token today
  [BNB_MUSD]: 1, // real, low real-world count — matches the live Token API
};

export function createTestApiClient(): ApiPlatformClient {
  const client = new ApiPlatformClient({ clientProduct: 'metamask-test' });
  const { queryClient } = client;
  queryClient.setDefaultOptions({
    queries: { ...queryClient.getDefaultOptions().queries, retry: false },
  });
  return client;
}

/**
 * Intercept `GET /v1/suggestedOccurrenceFloors`.
 *
 * @param options - Response overrides.
 * @param options.floors - The floors to answer with.
 * @param options.status - HTTP status to answer with. Defaults to 200.
 * @param options.times - How many requests to intercept. Defaults to 1.
 * @returns The nock scope.
 */
export function mockSuggestedOccurrenceFloors({
  floors = SUGGESTED_OCCURRENCE_FLOORS,
  status = 200,
  times = 1,
}: {
  floors?: Record<string, number>;
  status?: number;
  times?: number;
} = {}): nock.Scope {
  return nock(API_URLS.TOKEN)
    .get('/v1/suggestedOccurrenceFloors')
    .times(times)
    .reply(
      status,
      status === 200 ? floors : { message: 'Service Unavailable' },
    );
}

export type V3AssetsMock = {
  scope: nock.Scope;
  /** The asset IDs each intercepted request asked about, in request order. */
  requestedBatches: string[][];
};

/**
 * Intercept `GET /v3/assets`
 *
 * @param options - Response overrides.
 * @param options.occurrences - Occurrence counts keyed by CAIP-19 asset ID.
 * @param options.omit - Asset IDs to leave out of the response altogether, as
 * the API does for chains it does not serve.
 * @param options.status - HTTP status to answer with. Defaults to 200.
 * @param options.times - How many requests to intercept. Defaults to 1.
 * @param options.casing - The casing to answer with. Defaults to 'lowercase'.
 * @returns The nock scope alongside the asset IDs each request asked about.
 */
export function mockV3Assets({
  occurrences = TOKEN_API_OCCURRENCES,
  omit = [],
  status = 200,
  times = 1,
  casing = 'lowercase',
}: {
  occurrences?: Record<string, number | undefined>;
  omit?: string[];
  status?: number;
  times?: number;
  casing?: 'lowercase' | 'checksum';
} = {}): V3AssetsMock {
  const requestedBatches: string[][] = [];
  const omitted = new Set(omit.map((assetId) => assetId.toLowerCase()));

  const scope = nock(API_URLS.TOKENS)
    .get('/v3/assets')
    .query(true)
    .times(times)
    .reply(status, (uri: string) => {
      const assetIds = readAssetIds(uri);
      requestedBatches.push(assetIds);
      if (status !== 200) {
        return { message: 'Service Unavailable' };
      }
      return assetIds
        .filter((assetId) => !omitted.has(assetId.toLowerCase()))
        .map((assetId) => buildAssetResponse(assetId, occurrences, casing))
        .reverse();
    });

  return { scope, requestedBatches };
}

/**
 * Wait until every registered interceptor has been consumed, so tests driving
 * the sweep through an event (rather than awaiting it) can wait on its real
 * HTTP round trips instead of guessing at a number of microtask flushes.
 *
 * @param timeoutMs - How long to wait before giving up. Defaults to 2000.
 */
export async function waitForTokenApiRequests(
  timeoutMs = 2_000,
): Promise<void> {
  await waitFor(
    () => {
      if (pendingMocks().length > 0) {
        throw new Error('Mocks are still pending');
      }
    },
    { timeoutMs, intervalMs: 5 },
  );
}

/**
 * Read the requested asset IDs back off a `/v3/assets` request URI.
 *
 * @param uri - The intercepted request URI, path and query.
 * @returns The asset IDs the caller asked about.
 */
function readAssetIds(uri: string): string[] {
  const assetIds = new URL(uri, API_URLS.TOKENS).searchParams.get('assetIds');
  return assetIds ? assetIds.split(',') : [];
}

/**
 * Build one entry of a `/v3/assets` response: a described asset if the API
 * carries the token, an empty stub if no list does.
 *
 * @param assetId - The CAIP-19 asset ID, as requested.
 * @param occurrences - Occurrence counts keyed by CAIP-19 asset ID.
 * @param casing - Whether to answer with lowercase or checksummed asset IDs.
 * @returns The response entry.
 */
function buildAssetResponse(
  assetId: string,
  occurrences: Record<string, number | undefined>,
  casing: 'lowercase' | 'checksum' = 'lowercase',
): Json {
  const lowerId = assetId.toLowerCase();
  const knownId = Object.keys(occurrences).find(
    (candidate) => candidate.toLowerCase() === lowerId,
  );
  const metadata =
    knownId === undefined ? undefined : findTokenMetadata(knownId);

  const responseAssetId =
    casing === 'checksum' && knownId !== undefined ? knownId : lowerId;

  if (knownId === undefined || metadata === undefined) {
    return {
      symbol: '',
      name: '',
      decimals: null,
      address: lowerId.split(':').pop() ?? lowerId,
      type: 'erc20',
      assetId: responseAssetId,
    };
  }

  const count = occurrences[knownId];
  return {
    assetId: responseAssetId,
    decimals: metadata.decimals,
    name: metadata.name,
    symbol: metadata.symbol,
    ...(count === undefined ? {} : { occurrences: count }),
  };
}
