import { API_URLS } from '@metamask/core-backend';
import { writeFile } from '@metamask/utils/node';

/**
 * Captures the API responses the websocket-update pipeline asks for, verbatim,
 * into this directory. Re-run with:
 *
 * ```sh
 * node --experimental-strip-types packages/assets-controller/src/__fixtures__/ws-price-updates/captureWsApiResponses.ts
 * ```
 *
 * The captures are what the AccountActivity (websocket) update pass requests:
 * occurrence floors (spam filtering of websocket airdrops), Tokens API metadata
 * for the assets the event surfaced, and Price API spot prices — the same pass
 * `AssetsController.handleAssetsUpdate` runs after a
 * `AccountActivityService:balanceUpdated` event, plus the supported-networks
 * manifests each API serves.
 *
 * The asset IDs mirror `../wallet.ts` (kept inline so the script runs with
 * plain `node --experimental-strip-types`, which does not remap `.js` imports).
 */

const OUT_DIR = `${import.meta.dirname}/api-responses`;

/**
 * The assets the example websocket event reports balances for, in the
 * checksummed form `AccountActivityDataSource` normalization emits.
 */
const WS_EVENT_ASSET_IDS = [
  'eip155:1/slip44:60',
  'eip155:1/erc20:0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
] as const;

const V3_ASSETS_QUERY = {
  includeIconUrl: 'true',
  includeMarketData: 'true',
  includeMetadata: 'true',
  includeLabels: 'true',
  includeRwaData: 'true',
  includeAggregators: 'true',
  includeOccurrences: 'true',
} as const;

const V3_SPOT_PRICES_QUERY = {
  vsCurrency: 'usd',
  includeMarketData: 'true',
  cacheOnly: 'false',
} as const;

/**
 * Fetch and parse JSON from the given URL, throwing on HTTP failures.
 *
 * @param url - The URL to fetch.
 * @returns The parsed response body.
 */
async function fetchJson(url: string): Promise<unknown> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Request failed: ${response.status} ${url}`);
  }
  return response.json();
}

/**
 * Write a captured response as a fixture module.
 *
 * @param relativePath - The fixture path, relative to `api-responses/`.
 * @param constName - The exported constant's name.
 * @param data - The captured response body.
 */
async function writeFixture(
  relativePath: string,
  constName: string,
  data: unknown,
): Promise<void> {
  await writeFile(
    `${OUT_DIR}/${relativePath}`,
    `const ${constName} = ${JSON.stringify(data, null, 2)} as const;\n\nexport default ${constName};\n`,
  );
}

/** Base URLs for the services the capture script reads. */
const SERVICE_BASE_URLS: Record<'accounts' | 'tokens' | 'price', string> = {
  accounts: API_URLS.ACCOUNTS,
  tokens: API_URLS.TOKENS,
  price: API_URLS.PRICES,
};

/**
 * Capture a service's `/v2/supportedNetworks` manifest.
 *
 * @param service - The service whose manifest to capture.
 */
async function captureSupportedNetworks(
  service: 'accounts' | 'tokens' | 'price',
): Promise<void> {
  const networks = await fetchJson(
    `${SERVICE_BASE_URLS[service]}/v2/supportedNetworks`,
  );
  await writeFixture(
    `${service}-api/v2-supportedNetworks.ts`,
    `${service}V2SupportedNetworks`,
    networks,
  );
}

/**
 * Capture every fixture the websocket-update tests replay.
 */
async function main(): Promise<void> {
  await captureSupportedNetworks('accounts');
  await captureSupportedNetworks('tokens');
  await captureSupportedNetworks('price');

  const floors = await fetchJson(
    `${API_URLS.TOKEN}/v1/suggestedOccurrenceFloors`,
  );
  await writeFixture(
    'token-api/suggestedOccurrenceFloors.ts',
    'suggestedOccurrenceFloors',
    floors,
  );

  const assetsParams = new URLSearchParams({
    ...V3_ASSETS_QUERY,
    assetIds: WS_EVENT_ASSET_IDS.join(','),
  });
  const assets = (await fetchJson(
    `${API_URLS.TOKENS}/v3/assets?${assetsParams.toString()}`,
  )) as { assetId?: string }[];
  // Keyed by the lower-cased asset ID the API echoes back, matching
  // `__fixtures__/bsc-spam-token/api-responses/index.ts`.
  const assetsByLowerId: Record<string, unknown> = {};
  for (const entry of assets) {
    if (entry.assetId) {
      assetsByLowerId[entry.assetId.toLowerCase()] = entry;
    }
  }
  await writeFixture('tokens-api/v3-assets.ts', 'v3Assets', assetsByLowerId);

  const pricesParams = new URLSearchParams({
    ...V3_SPOT_PRICES_QUERY,
    assetIds: WS_EVENT_ASSET_IDS.join(','),
  });
  const spotPrices = (await fetchJson(
    `${API_URLS.PRICES}/v3/spot-prices?${pricesParams.toString()}`,
  )) as Record<string, unknown>;
  await writeFixture('price-api/v3-spot-prices.ts', 'v3SpotPrices', spotPrices);

  console.log(
    `Captured ${Object.keys(assetsByLowerId).length} assets and ${Object.keys(spotPrices).length} spot prices.`,
  );
}

main().catch((error) => {
  console.error(error);
  throw error;
});
