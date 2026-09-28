import { API_URLS } from '@metamask/core-backend';
import type { V3AssetResponse } from '@metamask/core-backend';
import type { Json } from '@metamask/utils';
import nock from 'nock';

import accountsV2SupportedNetworks from './accounts-api/v2-supportedNetworks.js';
import v5MultiAccountBalances from './accounts-api/v5-multiaccount-balances.js';
import v6MultiAccountBalances, {
  v6MaliciousBalanceRows,
} from './accounts-api/v6-multiaccount-balances.js';
import pricesV2SupportedNetworks from './price-api/v2-supportedNetworks.js';
import v3SpotPrices from './price-api/v3-spot-prices.js';
import suggestedOccurrenceFloors from './token-api/suggestedOccurrenceFloors.js';
import tokensV2SupportedNetworks from './tokens-api/v2-supportedNetworks.js';
import v3Assets from './tokens-api/v3-assets.js';

/** Captured `/v3/assets` entries, keyed by lower-cased CAIP-19 asset ID. */
const V3_ASSETS_BY_LOWER_ID = v3Assets as unknown as Record<
  string,
  V3AssetResponse
>;

/** Captured `/v3/spot-prices` entries, keyed by lower-cased CAIP-19 asset ID. */
const V3_SPOT_PRICES_BY_LOWER_ID = v3SpotPrices as unknown as Record<
  string,
  Json
>;

/**
 * A batched interceptor plus a log of what it was asked for.
 */
type BatchRecordingMock = {
  scope: nock.Scope;
  /** The asset IDs each intercepted request asked about, in request order. */
  requestedBatches: string[][];
};

/**
 * The v6 balances interceptor plus a log of the query parameters each
 * intercepted request was asked about.
 */
export type V6BalancesMock = {
  scope: nock.Scope;
  /** The account IDs each intercepted request asked about, in request order. */
  requestedAccountIds: string[][];
  /** The `includeAssetIds` (user-pinned assets) each request asked about. */
  requestedIncludeAssetIds: string[][];
  /** The `excludeAssetIds` (user-hidden assets) each request asked about. */
  requestedExcludeAssetIds: string[][];
};

/**
 * Intercept `GET https://chainid.network/chains.json`, which
 * `AssetsController` fetches on boot to fill native-asset gaps.
 *
 * @returns The nock scope.
 */
function mockChainIdNetwork(): nock.Scope {
  return nock('https://chainid.network')
    .persist()
    .get('/chains.json')
    .reply(200, []);
}

/**
 * Intercept `GET {ACCOUNTS}/v2/supportedNetworks`, which
 * `AccountsApiDataSource` reads to decide which chains it claims.
 *
 * @returns The nock scope.
 */
function mockAccountsSupportedNetworks(): nock.Scope {
  return nock(API_URLS.ACCOUNTS)
    .persist()
    .get('/v2/supportedNetworks')
    .reply(200, accountsV2SupportedNetworks);
}

/**
 * Intercept `GET {ACCOUNTS}/v5/multiaccount/balances` with the wallet's
 * captured 38 holdings.
 *
 * @param omitAssetIds - Asset IDs (any casing) to drop from the captured
 * balances, simulating a token the Accounts API does not index.
 * @returns The nock scope and the account IDs each request asked about.
 */
function mockV5MultiAccountBalances(omitAssetIds: string[] = []): {
  scope: nock.Scope;
  requestedAccountIds: string[][];
} {
  const requestedAccountIds: string[][] = [];
  const omitted = new Set(omitAssetIds.map((assetId) => assetId.toLowerCase()));

  const scope = nock(API_URLS.ACCOUNTS)
    .persist()
    .get('/v5/multiaccount/balances')
    .query(true)
    .reply(200, (uri: string) => {
      requestedAccountIds.push(
        readListParam(uri, 'accountIds', API_URLS.ACCOUNTS),
      );
      const balances = v5MultiAccountBalances.balances.filter(
        (entry) => !omitted.has(entry.assetId.toLowerCase()),
      );
      return { ...v5MultiAccountBalances, count: balances.length, balances };
    });

  return { scope, requestedAccountIds };
}

/**
 * Intercept `GET {ACCOUNTS}/v6/multiaccount/balances`, mirroring how the live
 * endpoint answers this wallet:
 *
 * - The captured 29 non-`Malicious` rows are always returned.
 * - The nine `Malicious` rows the capture omits are answered only when the
 *   request asks for them through `includeAssetIds` (a pin survives its
 *   classification), exactly as the live backend does.
 * - `excludeAssetIds` (user-hidden assets) are dropped outright — a hide wins
 *   over a pin.
 * - A pinned ID the mock is told to treat as unprocessable (or one the
 *   capture does not know at all) is echoed back in
 *   `unprocessedIncludeAssetIds` with no balance row, as the live backend
 *   answers unindexed tokens.
 *
 * @param options - Options for shaping the intercepted response.
 * @param options.omitAssetIds - Asset IDs (any casing) to drop from the
 * captured balances, simulating a token the Accounts API does not index.
 * @param options.unprocessedAssetIds - Asset IDs (any casing) to echo back in
 * `unprocessedIncludeAssetIds` even when requested through
 * `includeAssetIds`, simulating a pin the backend could not resolve.
 * @returns The nock scope and the query parameters each request asked about.
 */
function mockV6MultiAccountBalances({
  omitAssetIds = [],
  unprocessedAssetIds = [],
}: {
  omitAssetIds?: string[];
  unprocessedAssetIds?: string[];
} = {}): V6BalancesMock {
  const requestedAccountIds: string[][] = [];
  const requestedIncludeAssetIds: string[][] = [];
  const requestedExcludeAssetIds: string[][] = [];

  const omitted = new Set(omitAssetIds.map((assetId) => assetId.toLowerCase()));
  const unprocessable = new Set(
    unprocessedAssetIds.map((assetId) => assetId.toLowerCase()),
  );
  const maliciousByLowerAssetId = new Map(
    v6MaliciousBalanceRows.map((row) => [row.assetId.toLowerCase(), row]),
  );
  const capturedByLowerAssetId = new Set(
    v6MultiAccountBalances.balances.map((row) => row.assetId.toLowerCase()),
  );

  const scope = nock(API_URLS.ACCOUNTS)
    .persist()
    .get('/v6/multiaccount/balances')
    .query(true)
    .reply(200, (uri: string) => {
      const accountIds = readListParam(uri, 'accountIds', API_URLS.ACCOUNTS);
      const includeAssetIds = readListParam(
        uri,
        'includeAssetIds',
        API_URLS.ACCOUNTS,
      );
      const excludeAssetIds = readListParam(
        uri,
        'excludeAssetIds',
        API_URLS.ACCOUNTS,
      );
      requestedAccountIds.push(accountIds);
      requestedIncludeAssetIds.push(includeAssetIds);
      requestedExcludeAssetIds.push(excludeAssetIds);

      const excluded = new Set(
        excludeAssetIds.map((assetId) => assetId.toLowerCase()),
      );

      const balances = v6MultiAccountBalances.balances.filter(
        (row) =>
          !omitted.has(row.assetId.toLowerCase()) &&
          !excluded.has(row.assetId.toLowerCase()),
      );

      const unprocessedIncludeAssetIds: string[] = [];
      for (const assetId of includeAssetIds) {
        const lowerAssetId = assetId.toLowerCase();
        // A hide wins over a pin: hidden IDs are dropped, not echoed.
        if (excluded.has(lowerAssetId)) {
          continue;
        }
        if (unprocessable.has(lowerAssetId)) {
          unprocessedIncludeAssetIds.push(assetId);
          continue;
        }
        const maliciousRow = maliciousByLowerAssetId.get(lowerAssetId);
        if (maliciousRow !== undefined && !omitted.has(lowerAssetId)) {
          balances.push(maliciousRow);
        } else if (
          !capturedByLowerAssetId.has(lowerAssetId) &&
          !omitted.has(lowerAssetId)
        ) {
          // Pinned IDs the backend cannot resolve at all.
          unprocessedIncludeAssetIds.push(assetId);
        }
      }

      return {
        balances,
        unprocessedNetworks: [],
        unprocessedIncludeAssetIds: [...new Set(unprocessedIncludeAssetIds)],
      };
    });

  return {
    scope,
    requestedAccountIds,
    requestedIncludeAssetIds,
    requestedExcludeAssetIds,
  };
}

/**
 * Intercept `GET {TOKENS}/v2/supportedNetworks`. `eip155:56` is in the captured
 * `fullSupport` list, so BNB Chain assets genuinely reach the occurrence filter
 * rather than being skipped as unsupported.
 *
 * @returns The nock scope.
 */
function mockTokensSupportedNetworks(): nock.Scope {
  return nock(API_URLS.TOKENS)
    .persist()
    .get('/v2/supportedNetworks')
    .reply(200, tokensV2SupportedNetworks);
}

/**
 * Intercept `GET {TOKEN}/v1/suggestedOccurrenceFloors`. The capture has no
 * `56` entry, so BNB Chain falls back to `TokenDataSource`'s floor of three.
 *
 * @returns The nock scope.
 */
function mockSuggestedOccurrenceFloors(): nock.Scope {
  return nock(API_URLS.TOKEN)
    .persist()
    .get('/v1/suggestedOccurrenceFloors')
    .reply(200, suggestedOccurrenceFloors);
}

/**
 * Intercept `GET {TOKENS}/v3/assets`, answering each batch from the captured
 * per-asset entries and preserving the API's lower-case `assetId` echo. Assets
 * the API does not carry are answered as empty stubs, as it does for tokens on
 * chains it does not index.
 *
 * @returns The nock scope and the asset IDs each request asked about.
 */
function mockV3Assets(): BatchRecordingMock {
  const requestedBatches: string[][] = [];

  const scope = nock(API_URLS.TOKENS)
    .persist()
    .get('/v3/assets')
    .query(true)
    .reply(200, (uri: string) => {
      const assetIds = readListParam(uri, 'assetIds', API_URLS.TOKENS);
      requestedBatches.push(assetIds);
      return assetIds.map((assetId) => lookupAsset(assetId));
    });

  return { scope, requestedBatches };
}

/**
 * Intercept `GET {PRICES}/v2/supportedNetworks`, which `PriceDataSource` reads
 * before fetching.
 *
 * @returns The nock scope.
 */
function mockPricesSupportedNetworks(): nock.Scope {
  return nock(API_URLS.PRICES)
    .persist()
    .get('/v2/supportedNetworks')
    .reply(200, pricesV2SupportedNetworks);
}

/**
 * Intercept `GET {PRICES}/v3/spot-prices`, answering from the captured prices
 * and keying the response lower-case as the live API does. Assets with no
 * captured price are simply absent, as they are upstream.
 *
 * @returns The nock scope and the asset IDs each request asked about.
 */
function mockV3SpotPrices(): BatchRecordingMock {
  const requestedBatches: string[][] = [];

  const scope = nock(API_URLS.PRICES)
    .persist()
    .get('/v3/spot-prices')
    .query(true)
    .reply(200, (uri: string) => {
      const assetIds = readListParam(uri, 'assetIds', API_URLS.PRICES);
      requestedBatches.push(assetIds);

      const prices: Record<string, Json> = {};
      for (const assetId of assetIds) {
        const lowerId = assetId.toLowerCase();
        const captured = V3_SPOT_PRICES_BY_LOWER_ID[lowerId];
        if (captured !== undefined) {
          prices[lowerId] = captured;
        }
      }
      return prices;
    });

  return { scope, requestedBatches };
}

/**
 * Register every interceptor both balance lanes need except the balances
 * endpoint itself: Accounts API supported networks, Tokens API supported
 * networks and assets, the Token API occurrence floors, the Price API
 * supported networks and spot prices, and `chainid.network/chains.json`,
 * which `AssetsController` fetches on boot to fill native-asset gaps.
 *
 * All interceptors persist, so batch composition and cache misses cannot make
 * a test fail for want of a matching interceptor.
 *
 * @returns The recording mocks, and other utils.
 */
function registerSharedBscSpamMocks(): {
  accountsSupportedNetworks: nock.Scope;
  assets: BatchRecordingMock;
  prices: BatchRecordingMock;
} {
  const accountsSupportedNetworks = mockAccountsSupportedNetworks();
  mockTokensSupportedNetworks();
  mockSuggestedOccurrenceFloors();
  mockPricesSupportedNetworks();
  mockChainIdNetwork();

  const assets = mockV3Assets();
  const prices = mockV3SpotPrices();

  return { accountsSupportedNetworks, assets, prices };
}

/**
 * Register every interceptor the Accounts API v5 fast fetch lane needs for
 * this wallet: the shared Tokens / Token / Price API interceptors plus
 * `GET {ACCOUNTS}/v5/multiaccount/balances` with the wallet's captured 38
 * holdings. No v6 interceptor is registered, so a stray v6 request fails the
 * test loudly instead of being silently answered.
 *
 * @param options - Options for shaping the intercepted responses.
 * @param options.omitBalanceAssetIds - Asset IDs (any casing) to drop from
 * the captured balances, simulating tokens the Accounts API does not index.
 * @returns The recording mocks, and other utils.
 */
export function mockBscSpamApis({
  omitBalanceAssetIds = [],
}: {
  omitBalanceAssetIds?: string[];
} = {}): {
  accountsSupportedNetworks: nock.Scope;
  balances: { requestedAccountIds: string[][] };
  assets: BatchRecordingMock;
  prices: BatchRecordingMock;
} {
  const { accountsSupportedNetworks, assets, prices } =
    registerSharedBscSpamMocks();

  const balances = mockV5MultiAccountBalances(omitBalanceAssetIds);

  return { accountsSupportedNetworks, balances, assets, prices };
}

/**
 * Register every interceptor the Accounts API v6 fast fetch lane needs for
 * this wallet: the shared Tokens / Token / Price API interceptors plus the
 * spec-accurate `GET {ACCOUNTS}/v6/multiaccount/balances` built from the live
 * v6 capture (see {@link mockV6MultiAccountBalances}). No v5 interceptor is
 * registered, so a stray v5 request fails the test loudly instead of being
 * silently answered.
 *
 * @param options - Options for shaping the intercepted responses.
 * @param options.omitBalanceAssetIds - Asset IDs (any casing) to drop from
 * the captured balances.
 * @param options.unprocessedIncludeAssetIds - Asset IDs (any casing) to echo
 * back in `unprocessedIncludeAssetIds` even when requested through
 * `includeAssetIds`, simulating pins the backend could not resolve.
 * @returns The recording mocks, and other utils.
 */
export function mockBscSpamApisV6({
  omitBalanceAssetIds = [],
  unprocessedIncludeAssetIds = [],
}: {
  omitBalanceAssetIds?: string[];
  unprocessedIncludeAssetIds?: string[];
} = {}): {
  accountsSupportedNetworks: nock.Scope;
  v6Balances: V6BalancesMock;
  assets: BatchRecordingMock;
  prices: BatchRecordingMock;
} {
  const { accountsSupportedNetworks, assets, prices } =
    registerSharedBscSpamMocks();

  const v6Balances = mockV6MultiAccountBalances({
    omitAssetIds: omitBalanceAssetIds,
    unprocessedAssetIds: unprocessedIncludeAssetIds,
  });

  return { accountsSupportedNetworks, v6Balances, assets, prices };
}

/**
 * Read a comma-separated query parameter back off an intercepted request URI.
 *
 * @param uri - The intercepted request URI, path and query.
 * @param param - The query parameter name.
 * @param base - Base URL, so the relative URI can be parsed.
 * @returns The parameter's values.
 */
function readListParam(uri: string, param: string, base: string): string[] {
  const value = new URL(uri, base).searchParams.get(param);
  return value ? value.split(',') : [];
}

/**
 * Look up the captured `/v3/assets` entry for an asset, answering an empty stub
 * for tokens the API does not carry.
 *
 * @param assetId - The CAIP-19 asset ID, as requested (any casing).
 * @returns The captured entry, or an empty stub.
 */
function lookupAsset(assetId: string): V3AssetResponse {
  const captured = V3_ASSETS_BY_LOWER_ID[assetId.toLowerCase()];
  if (captured) {
    return captured;
  }
  return {
    symbol: '',
    name: '',
    decimals: null,
    address: assetId.split(':').pop() ?? assetId,
    type: 'erc20',
    assetId: assetId.toLowerCase(),
  } as unknown as V3AssetResponse;
}
