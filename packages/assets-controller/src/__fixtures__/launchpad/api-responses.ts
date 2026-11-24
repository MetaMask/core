import { API_URLS } from '@metamask/core-backend';
import nock from 'nock';

import accountsV2SupportedNetworks from '../ws-price-updates/api-responses/accounts-api/v2-supportedNetworks.js';
import pricesV2SupportedNetworks from '../ws-price-updates/api-responses/price-api/v2-supportedNetworks.js';
import suggestedOccurrenceFloors from '../ws-price-updates/api-responses/token-api/suggestedOccurrenceFloors.js';
import tokensV2SupportedNetworks from '../ws-price-updates/api-responses/tokens-api/v2-supportedNetworks.js';
import { LAUNCHPAD_CAIP_ACCOUNT_ID, LAUNCHPAD_TOKENS } from './wallet.js';

const TOKENS_BY_LOWER_ID = new Map(
  LAUNCHPAD_TOKENS.map((token) => [token.assetId.toLowerCase(), token]),
);

function readAssetIds(request: Request): string[] {
  const value = new URL(request.url, API_URLS.TOKENS).searchParams.get(
    'assetIds',
  );
  return value ? value.split(',') : [];
}

/**
 * Register every interceptor the launchpad scenarios need. Hand-built rather
 * than captured: launchpad data on the dev API is still being populated.
 *
 * @returns The `/v2/supportedNetworks` scope and the asset IDs each
 * `/v2/assets` (launchpad lookup) request asked about.
 */
export function mockLaunchpadApis(): {
  accountsSupportedNetworks: nock.Scope;
  launchpadLookups: string[][];
} {
  const launchpadLookups: string[][] = [];

  nock('https://chainid.network').persist().get('/chains.json').reply(200, []);
  const accountsSupportedNetworks = nock(API_URLS.ACCOUNTS)
    .persist()
    .get('/v2/supportedNetworks')
    .reply(200, accountsV2SupportedNetworks);
  nock(API_URLS.TOKENS)
    .persist()
    .get('/v2/supportedNetworks')
    .reply(200, tokensV2SupportedNetworks);
  nock(API_URLS.PRICES)
    .persist()
    .get('/v2/supportedNetworks')
    .reply(200, pricesV2SupportedNetworks);
  nock(API_URLS.PRICES)
    .persist()
    .get('/v3/spot-prices')
    .query(true)
    .reply(200, {});
  nock(API_URLS.TOKEN)
    .persist()
    .get('/v1/suggestedOccurrenceFloors')
    .reply(200, suggestedOccurrenceFloors);

  // Tokens API: occurrence counts (no launchpad data here).
  nock(API_URLS.TOKENS)
    .persist()
    .get('/v3/assets')
    .query(true)
    .reply(200, (request: Request) =>
      readAssetIds(request).map((assetId) => {
        const token = TOKENS_BY_LOWER_ID.get(assetId.toLowerCase());
        return {
          assetId: assetId.toLowerCase(),
          name: token?.symbol ?? '',
          symbol: token?.symbol ?? '',
          decimals: 18,
          occurrences: token?.occurrences,
        };
      }),
    );

  // Token API: launchpad lookup for tokens below the floor.
  nock(API_URLS.TOKEN)
    .persist()
    .get('/v2/assets')
    .query(true)
    .reply(200, (request: Request) => {
      const assetIds = readAssetIds(request);
      launchpadLookups.push(assetIds);
      return assetIds.flatMap((assetId) => {
        const token = TOKENS_BY_LOWER_ID.get(assetId.toLowerCase());
        if (!token?.launchpad) {
          return [];
        }
        return [
          {
            assetId: assetId.toLowerCase(),
            symbol: token.symbol,
            name: token.symbol,
            decimals: 18,
            launchpad: 'flap',
            launchpadData: { protocol: null },
            securityData: { resultType: token.launchpad.securityResultType },
          },
        ];
      });
    });

  return { accountsSupportedNetworks, launchpadLookups };
}

/**
 * Intercept the Accounts API balances endpoint (v5 or v6) with one row per
 * launchpad scenario token, so the fetch path sees all four.
 *
 * @param version - Which balances endpoint the lane under test calls.
 */
export function mockLaunchpadBalances(version: 'v5' | 'v6'): void {
  nock(API_URLS.ACCOUNTS)
    .persist()
    .get(`/${version}/multiaccount/balances`)
    .query(true)
    .reply(200, {
      count: LAUNCHPAD_TOKENS.length,
      unprocessedNetworks: [],
      unprocessedIncludeAssetIds: [],
      balances: LAUNCHPAD_TOKENS.map((token) => ({
        object: 'token',
        type: 'erc20',
        accountId: LAUNCHPAD_CAIP_ACCOUNT_ID,
        assetId: token.assetId,
        name: token.symbol,
        symbol: token.symbol,
        decimals: 18,
        balance: '5.000000000000000000',
      })),
    });
}
