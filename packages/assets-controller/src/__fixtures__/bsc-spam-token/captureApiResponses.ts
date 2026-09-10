/**
 * Capture the live API responses behind the BNB Chain spam-token report into
 * `./api-responses/`, so `pipeline.bsc-spam-token.integration.test.ts` can
 * replay them through nock instead of hand-writing bodies.
 *
 * Run from the repo root:
 *
 * ```
 * yarn workspace @metamask/assets-controller exec \
 *   node --experimental-strip-types src/__fixtures__/bsc-spam-token/captureApiResponses.ts
 * ```
 *
 * Re-run when the wallet's holdings or the APIs' answers drift. Note that
 * occurrence counts and prices move over time: if a re-capture pushes CDOGE to
 * or above the chain's occurrence floor, the reproduction test loses its
 * subject and the fixture needs a different spam token.
 */
import { API_URLS } from '@metamask/core-backend';
import { writeFile } from '@metamask/utils/node';

const OUT_DIR = new URL('./api-responses/', import.meta.url);

// Inlined rather than imported from `./wallet.ts`: `node --experimental-strip-types`
// resolves relative specifiers literally, so the repo's mandatory `.js` extension
// would not find the `.ts` source. Keep these in step with `./wallet.ts`.
const BSC_CHAIN_ID = 'eip155:56';
const BSC_SPAM_WALLET_ADDRESS = '0x9decDe522Cc1285efe18AfdE31C79e89dee2e91E';

/** Matches `TokenDataSource.assetsMiddleware`'s own `/v3/assets` batch size. */
const BATCH_SIZE = 50;

/** The option set `TokenDataSource.assetsMiddleware` sends. */
const V3_ASSETS_QUERY = {
  includeIconUrl: 'true',
  includeMarketData: 'true',
  includeMetadata: 'true',
  includeLabels: 'true',
  includeRwaData: 'true',
  includeAggregators: 'true',
  includeOccurrences: 'true',
} as const;

type V5BalanceItem = { assetId: string };
type V5BalancesResponse = { balances: V5BalanceItem[] };

async function fetchJson(url: string): Promise<unknown> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Request failed: ${response.status} ${url}`);
  }
  return response.json();
}

/**
 * Write a captured body as a default-exported `as const` module.
 *
 * @param relativePath - Path under `./api-responses/`.
 * @param name - The exported binding name.
 * @param body - The captured JSON body.
 */
async function writeCapture(
  relativePath: string,
  name: string,
  body: unknown,
): Promise<void> {
  await writeFile(
    new URL(relativePath, OUT_DIR).pathname,
    `const ${name} = ${JSON.stringify(body, null, 2)} as const;\n\nexport default ${name};\n`,
  );
}

/**
 * Fetch `/v3/assets` and `/v3/spot-prices` for every asset the wallet holds,
 * batched the way the pipeline batches them, keyed by lowercased asset ID.
 *
 * @param assetIds - The wallet's CAIP-19 asset IDs.
 * @returns The per-asset `/v3/assets` entries and the merged spot-price map.
 */
async function captureAssetDetails(assetIds: string[]): Promise<{
  assets: Record<string, unknown>;
  prices: Record<string, unknown>;
}> {
  const assets: Record<string, unknown> = {};
  const prices: Record<string, unknown> = {};

  for (let i = 0; i < assetIds.length; i += BATCH_SIZE) {
    const batch = assetIds.slice(i, i + BATCH_SIZE);

    const assetParams = new URLSearchParams({
      ...V3_ASSETS_QUERY,
      assetIds: batch.join(','),
    });
    const entries = (await fetchJson(
      `${API_URLS.TOKENS}/v3/assets?${assetParams.toString()}`,
    )) as { assetId?: string }[];
    for (const entry of entries) {
      if (entry.assetId) {
        assets[entry.assetId.toLowerCase()] = entry;
      }
    }

    const priceParams = new URLSearchParams({
      assetIds: batch.join(','),
      vsCurrency: 'usd',
      includeMarketData: 'true',
      cacheOnly: 'false',
    });
    const spotPrices = (await fetchJson(
      `${API_URLS.PRICES}/v3/spot-prices?${priceParams.toString()}`,
    )) as Record<string, unknown>;
    for (const [assetId, price] of Object.entries(spotPrices)) {
      prices[assetId.toLowerCase()] = price;
    }
  }

  return { assets, prices };
}

async function main(): Promise<void> {
  const accountId = `${BSC_CHAIN_ID}:${BSC_SPAM_WALLET_ADDRESS}`;

  const [
    accountsSupportedNetworks,
    tokensSupportedNetworks,
    pricesSupportedNetworks,
    suggestedOccurrenceFloors,
    balances,
  ] = await Promise.all([
    fetchJson(`${API_URLS.ACCOUNTS}/v2/supportedNetworks`),
    fetchJson(`${API_URLS.TOKENS}/v2/supportedNetworks`),
    fetchJson(`${API_URLS.PRICES}/v2/supportedNetworks`),
    fetchJson(`${API_URLS.TOKEN}/v1/suggestedOccurrenceFloors`),
    fetchJson(
      `${API_URLS.ACCOUNTS}/v5/multiaccount/balances?accountIds=${encodeURIComponent(accountId)}`,
    ) as Promise<V5BalancesResponse>,
  ]);

  const assetIds = balances.balances.map((item) => item.assetId);
  const { assets, prices } = await captureAssetDetails(assetIds);

  await Promise.all([
    writeCapture(
      'accounts-api/v2-supportedNetworks.ts',
      'accountsV2SupportedNetworks',
      accountsSupportedNetworks,
    ),
    writeCapture(
      'accounts-api/v5-multiaccount-balances.ts',
      'v5MultiAccountBalances',
      balances,
    ),
    writeCapture(
      'tokens-api/v2-supportedNetworks.ts',
      'tokensV2SupportedNetworks',
      tokensSupportedNetworks,
    ),
    writeCapture('tokens-api/v3-assets.ts', 'v3Assets', assets),
    writeCapture(
      'token-api/suggestedOccurrenceFloors.ts',
      'suggestedOccurrenceFloors',
      suggestedOccurrenceFloors,
    ),
    writeCapture(
      'price-api/v2-supportedNetworks.ts',
      'pricesV2SupportedNetworks',
      pricesSupportedNetworks,
    ),
    writeCapture('price-api/v3-spot-prices.ts', 'v3SpotPrices', prices),
  ]);

  console.log(
    `Captured ${assetIds.length} balances, ${Object.keys(assets).length} token entries and ${Object.keys(prices).length} prices.`,
  );
}

main().catch((error) => {
  console.error(error);
  throw error;
});
