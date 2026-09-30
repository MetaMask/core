import { API_URLS } from '@metamask/core-backend';
import type { V3AssetResponse } from '@metamask/core-backend';
import type { Json } from '@metamask/utils';
import nock from 'nock';

import accountsV2SupportedNetworks from './accounts-api/v2-supportedNetworks.js';
import v6MultiAccountBalancesBsc from './accounts-api/v6-multiaccount-balances-bsc.js';
import v6MultiAccountBalancesMainnet from './accounts-api/v6-multiaccount-balances-mainnet.js';
import pricesV2SupportedNetworks from './price-api/v2-supportedNetworks.js';
import v3SpotPricesBsc from './price-api/v3-spot-prices-bsc.js';
import v3SpotPricesMainnet from './price-api/v3-spot-prices-mainnet.js';
import suggestedOccurrenceFloors from './token-api/suggestedOccurrenceFloors.js';
import tokensV2SupportedNetworks from './tokens-api/v2-supportedNetworks.js';
import v3AssetsBsc from './tokens-api/v3-assets-bsc.js';
import v3AssetsMainnet from './tokens-api/v3-assets-mainnet.js';

/** A `/v6/multiaccount/balances` row, as the live API returns it. */
export type V6BalanceEntry =
  (typeof v6MultiAccountBalancesBsc.balances)[number];

/** Captured `/v6/multiaccount/balances` rows for both wallets, by account ID. */
const V6_BALANCES_BY_ACCOUNT_ID: Record<string, V6BalanceEntry[]> = {};
for (const capture of [
  v6MultiAccountBalancesBsc,
  v6MultiAccountBalancesMainnet,
]) {
  for (const entry of capture.balances) {
    const key = entry.accountId.toLowerCase();
    (V6_BALANCES_BY_ACCOUNT_ID[key] ??= []).push(entry);
  }
}

/**
 * Occurrence count stamped on every captured `/v3/assets` entry so spam
 * filtering does not drop them (it has its own suite).
 */
const OCCURRENCES_ABOVE_FLOOR = 10_000;

/** Captured `/v3/assets` entries for both wallets, keyed by lower-cased asset ID. */
const V3_ASSETS_BY_LOWER_ID = [...v3AssetsBsc, ...v3AssetsMainnet].reduce<
  Record<string, V3AssetResponse>
>((map, entry) => {
  map[entry.assetId.toLowerCase()] = {
    ...entry,
    occurrences: OCCURRENCES_ABOVE_FLOOR,
  };
  return map;
}, {});

/** Captured `/v3/spot-prices` entries for both wallets, keyed by lower-cased asset ID. */
const V3_SPOT_PRICES_BY_LOWER_ID = {
  ...v3SpotPricesBsc,
  ...v3SpotPricesMainnet,
} as unknown as Record<string, Json>;

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
 * Intercept `GET {ACCOUNTS}/v2/supportedNetworks`. The capture claims BNB
 * Chain and mainnet, and lists solana under `partialSupport` as captured;
 * the Solana account still balances through the keyring snap. Hoodi was
 * never supported so the RPC fallback owns it.
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
 * Intercept `GET {TOKENS}/v2/supportedNetworks` (BNB Chain and mainnet are
 * both in the captured `fullSupport` list).
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
 * Intercept `GET {TOKEN}/v1/suggestedOccurrenceFloors` (the capture has no
 * `56` entry, so BNB Chain falls back to `TokenDataSource`'s floor).
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
 * Intercept `GET {TOKENS}/v3/assets`, answering each batch from the captured
 * entries and stubbing assets the API does not carry.
 *
 * @returns The nock scope and the asset IDs each request asked about.
 */
export function mockV3Assets(): {
  scope: nock.Scope;
  requestedBatches: string[][];
} {
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
 * Intercept `GET {PRICES}/v3/spot-prices`, answering from the captured prices.
 *
 * @returns The nock scope and the asset IDs each request asked about.
 */
export function mockV3SpotPrices(): {
  scope: nock.Scope;
  requestedBatches: string[][];
} {
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
 * Intercept `GET {ACCOUNTS}/v6/multiaccount/balances` with the captured
 * balances of whichever wallets the request asked about, plus the scenario's
 * mutations. Every requested `includeAssetIds` entry is answered, as the live
 * backend does.
 *
 * @param mutations - Scenario mutations of the captured balances.
 * @param mutations.omitAssetIds - Asset IDs (any casing) to drop.
 * @param mutations.setBalances - Asset IDs (any casing) whose captured balance
 * should be replaced, keyed lower-cased.
 * @param mutations.unprocessedNetworks - CAIP-2 chain IDs the API should
 * report as unprocessed, handing them to the RPC fallback.
 * @returns The nock scope and the account IDs each request asked about.
 */
export function mockV6MultiAccountBalances({
  omitAssetIds = [],
  setBalances = {},
  unprocessedNetworks = [],
}: {
  omitAssetIds?: string[];
  setBalances?: Record<string, string>;
  unprocessedNetworks?: string[];
} = {}): {
  scope: nock.Scope;
  requestedAccountIds: string[][];
} {
  const requestedAccountIds: string[][] = [];
  const omitted = new Set(omitAssetIds.map((assetId) => assetId.toLowerCase()));
  const replacements = new Map(
    Object.entries(setBalances).map(([assetId, balance]) => [
      assetId.toLowerCase(),
      balance,
    ]),
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
      requestedAccountIds.push(accountIds);

      const balances: V6BalanceEntry[] = [];
      const coveredLowerIds = new Set<string>();
      for (const accountId of accountIds) {
        // An account on a chain the API could not process is answered
        // with nothing; the chain is reported in `unprocessedNetworks`.
        const accountChainId = accountId.split(':').slice(0, 2).join(':');
        if (unprocessedNetworks.includes(accountChainId)) {
          continue;
        }
        for (const entry of V6_BALANCES_BY_ACCOUNT_ID[
          accountId.toLowerCase()
        ] ?? []) {
          if (omitted.has(entry.assetId.toLowerCase())) {
            continue;
          }
          const replacement = replacements.get(entry.assetId.toLowerCase());
          balances.push(
            replacement === undefined
              ? entry
              : { ...entry, balance: replacement },
          );
          coveredLowerIds.add(entry.assetId.toLowerCase());
        }
      }

      // Answer every requested includeAssetId, as the live backend does.
      for (const assetId of includeAssetIds) {
        const lowerId = assetId.toLowerCase();
        if (coveredLowerIds.has(lowerId)) {
          continue;
        }
        const chainPrefix = lowerId.split('/')[0];
        if (unprocessedNetworks.includes(chainPrefix)) {
          continue;
        }
        const accountId = accountIds.find((id) =>
          id.toLowerCase().startsWith(`${chainPrefix}:`),
        );
        if (!accountId) {
          continue;
        }
        balances.push({
          accountId,
          object: 'token',
          type: 'erc20',
          assetId: lowerId,
          name: '',
          symbol: '',
          decimals: 18,
          balance: '0',
          securityResultType: 'Verified',
        });
      }

      return {
        balances,
        unprocessedNetworks,
        unprocessedIncludeAssetIds: [],
      };
    });

  return { scope, requestedAccountIds };
}

/**
 * Register every interceptor the suite's wallets need. All interceptors
 * persist, so batch composition and cache misses cannot make a test fail
 * for want of an interceptor.
 *
 * @param options - Options for shaping the intercepted v6 balances response.
 * @param options.omitAssetIds - Asset IDs (any casing) to drop from the
 * captured balances.
 * @param options.setBalances - Asset IDs (any casing) whose captured balance
 * should be replaced.
 * @param options.unprocessedNetworks - CAIP-2 chain IDs the Accounts API
 * should report as unprocessed.
 * @returns The recording mocks.
 */
export function mockStaleBalanceApis({
  omitAssetIds = [],
  setBalances = {},
  unprocessedNetworks = [],
} = {}): {
  accountsSupportedNetworks: nock.Scope;
  balances: { requestedAccountIds: string[][] };
  assets: { scope: nock.Scope; requestedBatches: string[][] };
  prices: { scope: nock.Scope; requestedBatches: string[][] };
} {
  const accountsSupportedNetworks = mockAccountsSupportedNetworks();
  mockTokensSupportedNetworks();
  mockSuggestedOccurrenceFloors();
  mockPricesSupportedNetworks();
  mockChainIdNetwork();

  const balances = mockV6MultiAccountBalances({
    omitAssetIds,
    setBalances,
    unprocessedNetworks,
  });
  const assets = mockV3Assets();
  const prices = mockV3SpotPrices();

  return { accountsSupportedNetworks, balances, assets, prices };
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
 * Look up the captured `/v3/assets` entry for an asset, answering an empty
 * stub for tokens the API does not carry.
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
