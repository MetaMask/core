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

/** Enrichment operation timeout (ms). Hung Snap requests must not block callers. */
const ACCOUNT_ASSET_INFO_SNAP_TIMEOUT_MS = 15_000;

// TODO(STELLAR): Replace this chain allowlist with Accounts API-backed enrichment support.
const ACCOUNT_ASSET_INFO_ENRICHMENT_BY_CHAIN: Partial<
  Record<ChainId, boolean>
> = {
  'stellar:pubnet': true,
};

const ENRICHMENT_TIMEOUT = Symbol('enrichmentTimeout');

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

export type SnapAccountAssetInfoEnricherOptions = {
  getSnapIdForChain: (chainId: ChainId) => SnapId | undefined;
  callSnapRequest: (request: SnapAccountAssetInfoRequest) => Promise<unknown>;
  log?: typeof log;
};

export type EnrichAccountParams = {
  accountId: string;
  assetsBalance: Record<Caip19AssetId, AssetBalance>;
};

function extractChainFromAssetId(assetId: string): ChainId {
  const parsed = parseCaipAssetType(assetId as CaipAssetType);
  return parsed.chainId;
}

export function isAccountAssetInfoEnrichmentAvailable(chainId: ChainId): boolean {
  return ACCOUNT_ASSET_INFO_ENRICHMENT_BY_CHAIN[chainId] === true;
}

/**
 * Merge listed snap assets with enrichable custom assets on the requested chains.
 *
 * Custom assets can drop off `listAccountAssets` after trustline deactivation
 * (e.g. limit-0 tombstones) while still needing enrichment refresh.
 *
 * @param params - Listed assets, optional custom assets, and requested chains.
 * @returns Deduplicated asset list to fetch balances/enrichment for.
 */
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

export function hasAccountAssetInfoEnrichmentCandidate(params: {
  assetsBalance: NonNullable<DataResponse['assetsBalance']>;
  getSnapIdForChain: (chainId: ChainId) => SnapId | undefined;
}): boolean {
  const { assetsBalance, getSnapIdForChain } = params;

  for (const accountAssets of Object.values(assetsBalance)) {
    for (const assetId of Object.keys(accountAssets) as Caip19AssetId[]) {
      let chainId: ChainId;
      try {
        chainId = extractChainFromAssetId(assetId);
      } catch {
        continue;
      }

      if (
        isAccountAssetInfoEnrichmentAvailable(chainId) &&
        getSnapIdForChain(chainId)
      ) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Stateful enricher for Snap `getAccountAssetInfo` responses.
 *
 * Deduplicates the Snap fetch per `${accountId}:${chainId}` so concurrent
 * callers share one request, then each caller applies the result to its own
 * `assetsBalance` object.
 */
export class SnapAccountAssetInfoEnricher {
  readonly #getSnapIdForChain: (
    chainId: ChainId,
  ) => SnapId | undefined;

  readonly #callSnapRequest: (
    request: SnapAccountAssetInfoRequest,
  ) => Promise<unknown>;

  readonly #log: typeof log;

  readonly #inFlight = new Map<
    string,
    Promise<GetAccountAssetInfoResponse | undefined>
  >();

  constructor(options: SnapAccountAssetInfoEnricherOptions) {
    this.#getSnapIdForChain = options.getSnapIdForChain;
    this.#callSnapRequest = options.callSnapRequest;
    this.#log = options.log ?? log;
  }

  /**
   * Enrich all eligible assets for a single account.
   *
   * Groups assets by chain, then runs one deduplicated fetch per
   * (accountId, chainId) and applies the result to this caller's balances.
   *
   * @param params - Account id and that account's balance rows to mutate.
   */
  async enrichAccount(params: EnrichAccountParams): Promise<void> {
    const { accountId, assetsBalance } = params;
    const assetsByChain = this.#groupAssetsByChain(assetsBalance);

    for (const [chainId, assets] of assetsByChain) {
      await this.#enrich(accountId, chainId, assets, assetsBalance);
    }
  }

  /**
   * Deduplicate the Snap fetch for one (accountId, chainId), then apply to
   * this caller's `assetsBalance`.
   *
   * Concurrent callers share the in-flight fetch promise, but each applies
   * the response to its own balance object.
   *
   * @param accountId - Account id.
   * @param chainId - CAIP-2 chain id.
   * @param assets - All enrichable assets on that chain for the account.
   * @param assetsBalance - Account balance rows to update in place.
   * @returns Resolves when fetch (shared) and apply (per-caller) complete.
   */
  async #enrich(
    accountId: string,
    chainId: ChainId,
    assets: Caip19AssetId[],
    assetsBalance: Record<Caip19AssetId, AssetBalance>,
  ): Promise<void> {
    const key = `${accountId}:${chainId}`;
    let promise = this.#inFlight.get(key);
    if (!promise) {
      promise = this.#fetchWithTimeout(accountId, chainId, assets).finally(
        () => {
          this.#inFlight.delete(key);
        },
      );
      this.#inFlight.set(key, promise);
    }

    const accountAssetInfo = await promise;
    if (!accountAssetInfo) {
      return;
    }
    this.#apply(accountAssetInfo, assetsBalance);
  }

  /**
   * Fetch enrichment from the Snap, racing against a timeout so callers are
   * not blocked if the Snap hangs.
   *
   * @param accountId - Account id.
   * @param chainId - CAIP-2 chain id.
   * @param assets - All enrichable assets on that chain for the account.
   * @returns Snap response, or undefined on skip/timeout/error.
   */
  async #fetchWithTimeout(
    accountId: string,
    chainId: ChainId,
    assets: Caip19AssetId[],
  ): Promise<GetAccountAssetInfoResponse | undefined> {
    if (assets.length === 0) {
      return undefined;
    }

    const snapId = this.#getSnapIdForChain(chainId);
    if (!snapId) {
      return undefined;
    }

    try {
      const snapRequest = this.#fetch(accountId, snapId, chainId, assets);
      const result = await Promise.race([
        snapRequest,
        new Promise<typeof ENRICHMENT_TIMEOUT>((resolve) =>
          setTimeout(
            () => resolve(ENRICHMENT_TIMEOUT),
            ACCOUNT_ASSET_INFO_SNAP_TIMEOUT_MS,
          ),
        ),
      ]);

      if (result === ENRICHMENT_TIMEOUT) {
        snapRequest
          .then(() =>
            this.#log('Snap account asset info resolved after timeout', {
              accountId,
              snapId,
              chainId,
              assetCount: assets.length,
            }),
          )
          .catch((error) =>
            this.#log('Snap account asset info failed after timeout', {
              accountId,
              snapId,
              chainId,
              assetCount: assets.length,
              error,
            }),
          );
        return undefined;
      }

      return result;
    } catch (error) {
      this.#log('Failed to enrich snap account asset info', {
        accountId,
        snapId,
        chainId,
        assetCount: assets.length,
        error,
      });
      return undefined;
    }
  }

  /**
   * Build and execute a single Snap `getAccountAssetInfo` request.
   *
   * @param accountId - Account id.
   * @param snapId - Snap id for the chain.
   * @param chainId - CAIP-2 chain id.
   * @param assets - All enrichable assets on that chain for the account.
   * @returns Snap response, or undefined.
   */
  async #fetch(
    accountId: string,
    snapId: SnapId,
    chainId: ChainId,
    assets: Caip19AssetId[],
  ): Promise<GetAccountAssetInfoResponse | undefined> {
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

    return (await this.#callSnapRequest(
      request,
    )) as GetAccountAssetInfoResponse | undefined;
  }

  /**
   * Merge snap `getAccountAssetInfo` into the account's balance rows.
   *
   * Pure aside from mutating `assetsBalance`.
   *
   * @param accountAssetInfo - Enrichment keyed by CAIP-19 asset id.
   * @param assetsBalance - Account balance rows to update in place.
   */
  #apply(
    accountAssetInfo: GetAccountAssetInfoResponse,
    assetsBalance: Record<Caip19AssetId, AssetBalance>,
  ): void {
    for (const [assetId, assetInfo] of Object.entries(accountAssetInfo)) {
      const row = assetsBalance[assetId as Caip19AssetId];
      if (!row) {
        continue;
      }

      assetsBalance[assetId as Caip19AssetId] = {
        ...row,
        accountAssetInfo: assetInfo,
      } satisfies AssetBalance;
    }
  }

  #groupAssetsByChain(
    assetsBalance: Record<Caip19AssetId, AssetBalance>,
  ): Map<ChainId, Caip19AssetId[]> {
    const assetsByChain = new Map<ChainId, Caip19AssetId[]>();

    for (const assetId of Object.keys(assetsBalance) as Caip19AssetId[]) {
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

    return assetsByChain;
  }
}
