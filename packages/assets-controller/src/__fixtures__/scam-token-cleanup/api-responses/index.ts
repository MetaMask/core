/**
 * Nock helpers that answer the sweep's HTTP requests from the real API
 * responses captured into this directory by `../captureTokenApiResponses.ts`.
 *
 * Unlike `../../mockTokenApi.ts` (which synthesizes bodies by hand), these replay
 * verbatim captures so the integration test exercises the controller against
 * true-to-life occurrence counts and supported networks. The `/v3/assets`
 * capture is keyed by the lowercased asset ID the API actually returns, so any
 * batch composition is answered the way the live API would. Sourced from the
 * example scam-token wallet in `../scamWalletState.ts`.
 */
import { API_URLS } from '@metamask/core-backend';
import type { V3AssetResponse } from '@metamask/core-backend';
import type { Json } from '@metamask/utils';
import nock from 'nock';

import suggestedOccurrenceFloors from './token-api/suggestedOccurrenceFloors.js';
import v3Assets from './tokens-api/v3-assets.js';

/** The captured `/v3/assets` entries, keyed by lowercased CAIP-19 asset ID. */
const V3_ASSETS_BY_LOWER_ID = v3Assets as unknown as Record<
  string,
  V3AssetResponse
>;

/**
 * Intercept `GET {TOKEN}/v1/suggestedOccurrenceFloors` with the captured
 * response.
 *
 * @returns The nock scope.
 */
export function mockSuggestedOccurrenceFloors(): nock.Scope {
  return nock(API_URLS.TOKEN)
    .get('/v1/suggestedOccurrenceFloors')
    .reply(200, suggestedOccurrenceFloors as Record<string, number>);
}

/**
 * Intercept `GET {TOKENS}/v3/assets` and answer each batch from the captured
 * per-asset entries, preserving the API's reversed ordering and its lowercase
 * `assetId` echo. Assets the API does not carry are answered as empty stubs,
 * matching `../../mockTokenApi.ts`.
 *
 * @param options - Response overrides.
 * @param options.times - How many requests to intercept (one per 50-asset
 * batch). Defaults to as many as needed.
 * @returns The nock scope and the asset IDs each request asked about.
 */
export function mockV3Assets({
  times = 1,
}: {
  times?: number;
} = {}): { scope: nock.Scope; requestedBatches: string[][] } {
  const requestedBatches: string[][] = [];

  const scope = nock(API_URLS.TOKENS)
    .get('/v3/assets')
    .query(true)
    .times(times)
    .reply(200, (uri: string) => {
      const assetIds = readAssetIds(uri);
      requestedBatches.push(assetIds);
      return assetIds
        .map((assetId) => lookupAsset(assetId))
        .reverse() as Json[];
    });

  return { scope, requestedBatches };
}

/**
 * Register interceptors for the two endpoints the unlock-time spam sweep
 * (`cleanSpamAssets`) calls: `/v1/suggestedOccurrenceFloors` and the batched
 * `/v3/assets`. Supported networks are not consulted at unlock time (the sweep
 * uses a hardcoded Accounts-API chain list), so no interceptor is needed for
 * it.
 *
 * @param options - Response overrides.
 * @param options.assetBatches - How many `/v3/assets` requests to intercept.
 * @returns The `/v3/assets` mock, including the requested batches.
 */
export function mockSweepApis({
  assetBatches = 2,
}: {
  assetBatches?: number;
} = {}): { scope: nock.Scope; requestedBatches: string[][] } {
  mockSuggestedOccurrenceFloors();
  return mockV3Assets({ times: assetBatches });
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
 * Look up the captured `/v3/assets` entry for an asset, answering an empty
 * stub for tokens the API does not carry (as it does for unsupported chains).
 *
 * @param assetId - The CAIP-19 asset ID, as requested.
 * @returns The captured response entry, or an empty stub.
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
