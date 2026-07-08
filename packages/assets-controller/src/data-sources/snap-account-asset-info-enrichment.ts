// TODO(STELLAR): This helper is a temporary bridge for Snap-provided accountAssetInfo.
// Remove it once the Accounts API supports account-asset enrichment directly.

import type { CaipAssetType } from '@metamask/keyring-api';
import type { SnapId } from '@metamask/snaps-sdk';
import { HandlerType } from '@metamask/snaps-utils';
import { parseCaipAssetType } from '@metamask/utils';

import { projectLogger, createModuleLogger } from '../logger';
import type {
  AssetBalance,
  ChainId,
  Caip19AssetId,
  DataResponse,
  GetAccountAssetInfoResponse,
} from '../types';

const log = createModuleLogger(
  projectLogger,
  'snap-account-asset-info-enrichment',
);

export const GET_ACCOUNT_ASSET_INFO_CLIENT_METHOD = 'getAccountAssetInfo';

/**
 * Max assets per snap getAccountAssetInfo request. Large batches can terminate
 * the Stellar wallet snap on mobile when many trustlines are fetched at once.
 */
const ACCOUNT_ASSET_INFO_SNAP_BATCH_SIZE = 3;

/** Per-batch snap client request timeout (ms). Hung requests must not block apply. */
const ACCOUNT_ASSET_INFO_SNAP_TIMEOUT_MS = 15_000;

// TODO(STELLAR): Replace this chain allowlist with Accounts API-backed enrichment support.
const ACCOUNT_ASSET_INFO_ENRICHMENT_BY_CHAIN: Partial<
  Record<ChainId, boolean>
> = {
  'stellar:pubnet': true,
  'stellar:testnet': true,
};

const ENRICHMENT_TIMEOUT = Symbol('enrichmentTimeout');

function extractChainFromAssetId(assetId: string): ChainId {
  const parsed = parseCaipAssetType(assetId as CaipAssetType);
  return parsed.chainId;
}

export function isAccountAssetInfoEnrichmentAvailable(chainId: ChainId): boolean {
  return ACCOUNT_ASSET_INFO_ENRICHMENT_BY_CHAIN[chainId] === true;
}

export function getAssetsToFetchWithEligibleCustomAssets(params: {
  listedAssets: CaipAssetType[];
  customAssets?: Caip19AssetId[];
  requestedChainIds: ChainId[];
}): CaipAssetType[] {
  const { listedAssets, customAssets, requestedChainIds } = params;
  const assetsToFetch = new Set<CaipAssetType>(listedAssets);

  if (customAssets) {
    for (const assetId of customAssets) {
      try {
        const assetChainId = extractChainFromAssetId(assetId);
        if (
          requestedChainIds.includes(assetChainId) &&
          isAccountAssetInfoEnrichmentAvailable(assetChainId)
        ) {
          assetsToFetch.add(assetId as CaipAssetType);
        }
      } catch {
        // Ignore malformed custom asset ids.
      }
    }
  }

  return [...assetsToFetch];
}

type SnapAccountAssetInfoRequest = {
  snapId: SnapId;
  origin: string;
  handler: HandlerType;
  request: {
    jsonrpc: '2.0';
    method: string;
    params: {
      accountId: string;
      scope: ChainId;
      assets: Caip19AssetId[];
    };
  };
};

async function fetchAccountAssetInfoFromSnap({
  accountId,
  snapId,
  chainId,
  assets,
  callSnapRequest,
  moduleLog = log,
}: {
  accountId: string;
  snapId: SnapId;
  chainId: ChainId;
  assets: Caip19AssetId[];
  callSnapRequest: (request: SnapAccountAssetInfoRequest) => Promise<unknown>;
  moduleLog?: typeof log;
}): Promise<GetAccountAssetInfoResponse | typeof ENRICHMENT_TIMEOUT | undefined> {
  if (assets.length === 0) {
    return undefined;
  }

  try {
    const request: SnapAccountAssetInfoRequest = {
      snapId,
      origin: 'metamask',
      handler: HandlerType.OnClientRequest,
      request: {
        jsonrpc: '2.0',
        method: GET_ACCOUNT_ASSET_INFO_CLIENT_METHOD,
        params: {
          accountId,
          scope: chainId,
          assets,
        },
      },
    };

    const snapRequest = callSnapRequest(request);
    const result = await Promise.race([
      snapRequest,
      new Promise<typeof ENRICHMENT_TIMEOUT>((resolve) =>
        setTimeout(() => resolve(ENRICHMENT_TIMEOUT), ACCOUNT_ASSET_INFO_SNAP_TIMEOUT_MS),
      ),
    ]);

    if (result === ENRICHMENT_TIMEOUT) {
      snapRequest
        .then(() =>
          moduleLog('Snap account asset info resolved after timeout', {
            accountId,
            snapId,
            chainId,
            assetCount: assets.length,
          }),
        )
        .catch((error) =>
          moduleLog('Snap account asset info failed after timeout', {
            accountId,
            snapId,
            chainId,
            assetCount: assets.length,
            error,
          }),
        );
      return ENRICHMENT_TIMEOUT;
    }

    return result as GetAccountAssetInfoResponse | undefined;
  } catch (error) {
    moduleLog('Failed to enrich snap account asset info', {
      accountId,
      snapId,
      chainId,
      assetCount: assets.length,
      error,
    });
    return ENRICHMENT_TIMEOUT;
  }
}

export async function enrichAccountAssetInfo(params: {
  assetsBalance: NonNullable<DataResponse['assetsBalance']>;
  getSnapIdForChain: (chainId: ChainId) => SnapId | undefined;
  callSnapRequest: (request: SnapAccountAssetInfoRequest) => Promise<unknown>;
  log?: typeof log;
}): Promise<void> {
  const { assetsBalance, getSnapIdForChain, callSnapRequest, log: moduleLog } =
    params;

  for (const [accountId, accountAssets] of Object.entries(assetsBalance)) {
    const assetsByChain = new Map<ChainId, Caip19AssetId[]>();

    for (const assetId of Object.keys(accountAssets) as Caip19AssetId[]) {
      let chainId: ChainId;
      try {
        chainId = extractChainFromAssetId(assetId);
      } catch {
        continue;
      }
      if (!isAccountAssetInfoEnrichmentAvailable(chainId)) {
        continue;
      }

      const assetIds = assetsByChain.get(chainId) ?? [];
      assetIds.push(assetId);
      assetsByChain.set(chainId, assetIds);
    }

    for (const [chainId, assetIds] of assetsByChain) {
      const snapId = getSnapIdForChain(chainId);
      if (!snapId) {
        continue;
      }

      for (
        let i = 0;
        i < assetIds.length;
        i += ACCOUNT_ASSET_INFO_SNAP_BATCH_SIZE
      ) {
        const batch = assetIds.slice(
          i,
          i + ACCOUNT_ASSET_INFO_SNAP_BATCH_SIZE,
        );
        const accountAssetInfo = await fetchAccountAssetInfoFromSnap({
          accountId,
          snapId,
          chainId,
          assets: batch,
          callSnapRequest,
          moduleLog,
        });

        if (
          accountAssetInfo === ENRICHMENT_TIMEOUT ||
          accountAssetInfo === undefined
        ) {
          break;
        }

        for (const [assetId, assetInfo] of Object.entries(accountAssetInfo)) {
          const row = accountAssets[assetId as Caip19AssetId];
          if (!row) {
            continue;
          }

          accountAssets[assetId as Caip19AssetId] = {
            ...row,
            accountAssetInfo: assetInfo,
          } satisfies AssetBalance;
        }
      }
    }
  }
}
