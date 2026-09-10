import { API_URLS } from '@metamask/core-backend';
import type { V3AssetResponse } from '@metamask/core-backend';
import type { Json } from '@metamask/utils';
import nock from 'nock';

import accountsV2SupportedNetworks from './accounts-api/v2-supportedNetworks.js';
import v5MultiAccountBalances from './accounts-api/v5-multiaccount-balances.js';
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
 * @returns The nock scope and the account IDs each request asked about.
 */
function mockV5MultiAccountBalances(): {
  scope: nock.Scope;
  requestedAccountIds: string[][];
} {
  const requestedAccountIds: string[][] = [];

  const scope = nock(API_URLS.ACCOUNTS)
    .persist()
    .get('/v5/multiaccount/balances')
    .query(true)
    .reply(200, (uri: string) => {
      requestedAccountIds.push(
        readListParam(uri, 'accountIds', API_URLS.ACCOUNTS),
      );
      return v5MultiAccountBalances;
    });

  return { scope, requestedAccountIds };
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
 * Register every interceptor the fast fetch lane needs for this wallet:
 * Accounts API supported networks and balances, Tokens API supported networks
 * and assets, the Token API occurrence floors, and the Price API supported
 * networks and spot prices.
 *
 * All interceptors persist, so batch composition and cache misses cannot make a
 * test fail for want of an interceptor.
 *
 * @returns The recording mocks, for tests that assert on what was requested.
 */
export function mockBscSpamApis(): {
  balances: { requestedAccountIds: string[][] };
  assets: BatchRecordingMock;
  prices: BatchRecordingMock;
} {
  mockAccountsSupportedNetworks();
  mockTokensSupportedNetworks();
  mockSuggestedOccurrenceFloors();
  mockPricesSupportedNetworks();

  const balances = mockV5MultiAccountBalances();
  const assets = mockV3Assets();
  const prices = mockV3SpotPrices();

  return { balances, assets, prices };
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
