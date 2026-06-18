import type { SnapId } from '@metamask/snaps-sdk';
import type { CaipChainId } from '@metamask/utils';

import { reduceInBatchesSerially } from '../data-sources/evm-rpc-services/utils/batch';
import type {
  AccountId,
  Caip19AssetId,
  GetAccountAssetInfoResponse,
} from '../types';
import {
  ACCOUNT_ASSET_INFO_SNAP_BATCH_SIZE,
  fetchAccountAssetInfoFromSnap,
} from '../utils/account-asset-enrichment';
import type { SnapHandleRequestCaller } from '../utils/account-asset-enrichment';

export type AccountAssetEnrichmentServiceOptions = {
  handleSnapRequest: SnapHandleRequestCaller;
  getSnapIdForChain: (chainId: CaipChainId) => SnapId | undefined;
};

/**
 * Fetches per-account asset enrichment from wallet snaps (e.g. Stellar trustline data).
 * Deduplicates concurrent requests for the same account, chain, and asset set.
 * Batches large asset lists and serializes snap calls per snap id.
 */
export class AccountAssetEnrichmentService {
  readonly #handleSnapRequest: SnapHandleRequestCaller;

  readonly #getSnapIdForChain: (chainId: CaipChainId) => SnapId | undefined;

  readonly #inFlight = new Map<
    string,
    Promise<GetAccountAssetInfoResponse | undefined>
  >();

  readonly #snapTaskTail = new Map<SnapId, Promise<unknown>>();

  constructor({
    handleSnapRequest,
    getSnapIdForChain,
  }: AccountAssetEnrichmentServiceOptions) {
    this.#handleSnapRequest = handleSnapRequest;
    this.#getSnapIdForChain = getSnapIdForChain;
  }

  /**
   * Fetches account-asset enrichment from the wallet snap for the given chain.
   *
   * @param params - Account, chain, and asset ids to enrich.
   * @param params.accountId - Account to fetch enrichment for.
   * @param params.chainId - CAIP-2 chain id for the snap request scope.
   * @param params.assetIds - CAIP-19 asset ids to enrich on that chain.
   * @param params.onBatchExtras - Optional callback invoked after each successful batch.
   * @returns Per-asset enrichment map, or undefined when snap is unavailable or fails.
   */
  async fetchExtras({
    accountId,
    chainId,
    assetIds,
    onBatchExtras,
  }: {
    accountId: AccountId;
    chainId: CaipChainId;
    assetIds: Caip19AssetId[];
    onBatchExtras?: (
      extras: GetAccountAssetInfoResponse,
    ) => void | Promise<void>;
  }): Promise<GetAccountAssetInfoResponse | undefined> {
    if (assetIds.length === 0) {
      return undefined;
    }

    const snapId = this.#getSnapIdForChain(chainId);
    if (!snapId) {
      return undefined;
    }

    const dedupeKey = `${accountId}:${chainId}:${[...assetIds].sort().join(',')}`;
    const existing = this.#inFlight.get(dedupeKey);
    if (existing) {
      return existing;
    }

    const request = this.#enqueueSnapTask(snapId, () =>
      this.#fetchExtrasInBatches({
        accountId,
        snapId,
        chainId,
        assetIds,
        onBatchExtras,
      }),
    ).finally(() => {
      this.#inFlight.delete(dedupeKey);
    });

    this.#inFlight.set(dedupeKey, request);
    return request;
  }

  /**
   * Runs snap enrichment batches serially and merges partial results.
   *
   * @param params - Snap request parameters.
   * @param params.accountId - Account to fetch enrichment for.
   * @param params.snapId - Wallet snap id to invoke.
   * @param params.chainId - CAIP-2 chain id for the snap request scope.
   * @param params.assetIds - CAIP-19 asset ids to enrich.
   * @param params.onBatchExtras - Optional callback invoked after each successful batch.
   * @returns Merged per-asset enrichment map, or undefined when all batches fail.
   */
  async #fetchExtrasInBatches({
    accountId,
    snapId,
    chainId,
    assetIds,
    onBatchExtras,
  }: {
    accountId: AccountId;
    snapId: SnapId;
    chainId: CaipChainId;
    assetIds: Caip19AssetId[];
    onBatchExtras?: (
      extras: GetAccountAssetInfoResponse,
    ) => void | Promise<void>;
  }): Promise<GetAccountAssetInfoResponse | undefined> {
    const merged = await reduceInBatchesSerially<
      Caip19AssetId,
      GetAccountAssetInfoResponse
    >({
      values: assetIds,
      batchSize: ACCOUNT_ASSET_INFO_SNAP_BATCH_SIZE,
      initialResult: {} as GetAccountAssetInfoResponse,
      eachBatch: async (workingResult, batch) => {
        const batchResult = await fetchAccountAssetInfoFromSnap(
          this.#handleSnapRequest,
          {
            accountId,
            snapId,
            chainId,
            assets: batch,
          },
        );

        if (!batchResult) {
          return workingResult;
        }

        await onBatchExtras?.(batchResult);

        return {
          ...workingResult,
          ...batchResult,
        };
      },
    });

    return Object.keys(merged).length > 0 ? merged : undefined;
  }

  /**
   * Serializes snap client requests per snap id to avoid concurrent executions
   * terminating the snap runtime on mobile.
   *
   * @param snapId - Wallet snap id.
   * @param task - Snap work to run after prior tasks for this snap complete.
   * @returns The task result.
   */
  #enqueueSnapTask<TaskResult>(
    snapId: SnapId,
    task: () => Promise<TaskResult>,
  ): Promise<TaskResult> {
    const tail = this.#snapTaskTail.get(snapId) ?? Promise.resolve();
    const run = tail.catch(() => undefined).then(task);
    this.#snapTaskTail.set(
      snapId,
      run.then(
        () => undefined,
        () => undefined,
      ),
    );
    return run;
  }
}
