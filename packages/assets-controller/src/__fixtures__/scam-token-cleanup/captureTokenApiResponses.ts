import { API_URLS } from '@metamask/core-backend';
import { KnownCaipNamespace, parseCaipAssetType } from '@metamask/utils';
import { writeFileSync } from '@metamask/utils/node';

import { SCAM_WALLET_ASSETS_INFO } from './scamWalletState.js';

const OUT_DIR = new URL('./api-responses/', import.meta.url);
const BATCH_SIZE = 50;
const V3_ASSETS_QUERY = {
  includeIconUrl: 'true',
  includeMarketData: 'true',
  includeMetadata: 'true',
  includeLabels: 'true',
  includeRwaData: 'true',
  includeAggregators: 'true',
  includeOccurrences: 'true',
} as const;

function sweepableAssetIds(): string[] {
  return Object.keys(SCAM_WALLET_ASSETS_INFO).filter((assetId) => {
    try {
      const { assetNamespace, chain } = parseCaipAssetType(
        assetId as `${string}:${string}/${string}:${string}`,
      );
      return (
        chain.namespace === KnownCaipNamespace.Eip155 &&
        assetNamespace === 'erc20'
      );
    } catch {
      return false;
    }
  });
}

async function fetchJson(url: string): Promise<unknown> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Request failed: ${response.status} ${url}`);
  }
  return response.json();
}

async function main(): Promise<void> {
  const floors = await fetchJson(
    `${API_URLS.TOKEN}/v1/suggestedOccurrenceFloors`,
  );
  const assetIds = sweepableAssetIds();
  const assets: Record<string, unknown> = {};

  for (let i = 0; i < assetIds.length; i += BATCH_SIZE) {
    const batch = assetIds.slice(i, i + BATCH_SIZE);
    const params = new URLSearchParams({
      ...V3_ASSETS_QUERY,
      assetIds: batch.join(','),
    });
    const entries = (await fetchJson(
      `${API_URLS.TOKENS}/v3/assets?${params.toString()}`,
    )) as { assetId?: string }[];
    for (const entry of entries) {
      if (entry.assetId) {
        assets[entry.assetId] = entry;
      }
    }
  }

  writeFileSync(
    new URL('token-api/suggestedOccurrenceFloors.ts', OUT_DIR),
    `const suggestedOccurrenceFloors = ${JSON.stringify(floors, null, 2)} as const;\n\nexport default suggestedOccurrenceFloors;\n`,
  );
  writeFileSync(
    new URL('tokens-api/v3-assets.ts', OUT_DIR),
    `const v3Assets = ${JSON.stringify(assets, null, 2)} as const;\n\nexport default v3Assets;\n`,
  );

  console.log(
    `Captured ${Object.keys(assets).length} assets across ${assetIds.length} sweepable IDs.`,
  );
}

main().catch((error) => {
  console.error(error);
  throw error;
});
