import { StaticIntervalPollingControllerOnly } from '@metamask/polling-controller';
import { parseCaipAssetType } from '@metamask/utils';

import { ZERO_ADDRESS } from '../../../utils/constants';
import type { MulticallClient } from '../clients';
import type {
  AccountId,
  Address,
  AssetBalance,
  AssetFetchEntry,
  AssetsBalanceState,
  BalanceFetchResult,
  BalanceOfRequest,
  BalanceOfResponse,
  CaipAssetType,
  ChainId,
} from '../types';
import { reduceInBatchesSerially } from '../utils';

const DEFAULT_BALANCE_INTERVAL = 30_000; // 30 seconds

/**
 * Minimal messenger interface for BalanceFetcher.
 */
export type BalanceFetcherMessenger = {
  call: (action: 'AssetsController:getState') => AssetsBalanceState;
};

export type BalanceFetcherConfig = {
  defaultBatchSize?: number;
  defaultTimeoutMs?: number;
  /** Polling interval in ms (default: 30s) */
  pollingInterval?: number;
  /** Determines whether a CAIP-19 asset ID represents a native asset. */
  isNativeAsset: (assetId: CaipAssetType) => boolean;
};

/**
 * Polling input for BalanceFetcher - identifies what to poll for.
 */
export type BalancePollingInput = {
  /** Chain ID (hex format) */
  chainId: ChainId;
  /** Account ID */
  accountId: AccountId;
  /** Account address */
  accountAddress: Address;
};

/**
 * Callback type for balance updates.
 */
export type OnBalanceUpdateCallback = (
  result: BalanceFetchResult,
) => void | Promise<void>;

/**
 * BalanceFetcher - Fetches token balances via multicall.
 * Extends StaticIntervalPollingControllerOnly for built-in polling support.
 *
 * Callers provide CAIP-19 asset IDs; the fetcher extracts on-chain addresses
 * (or uses the zero address for native assets) and maps multicall responses
 * back to the original asset IDs. This ensures the returned balance entries
 * always carry the correct identifier regardless of chain.
 */
export class BalanceFetcher extends StaticIntervalPollingControllerOnly<BalancePollingInput>() {
  readonly #multicallClient: MulticallClient;

  readonly #messenger: BalanceFetcherMessenger;

  readonly #config: Required<
    Omit<BalanceFetcherConfig, 'pollingInterval' | 'isNativeAsset'>
  >;

  readonly #isNativeAsset: (assetId: CaipAssetType) => boolean;

  #onBalanceUpdate: OnBalanceUpdateCallback | undefined;

  constructor(
    multicallClient: MulticallClient,
    messenger: BalanceFetcherMessenger,
    config: BalanceFetcherConfig,
  ) {
    super();
    this.#multicallClient = multicallClient;
    this.#messenger = messenger;
    this.#config = {
      defaultBatchSize: config.defaultBatchSize ?? 300,
      defaultTimeoutMs: config.defaultTimeoutMs ?? 30000,
    };
    this.#isNativeAsset = config.isNativeAsset;

    // Set the polling interval
    this.setIntervalLength(config?.pollingInterval ?? DEFAULT_BALANCE_INTERVAL);
  }

  /**
   * Set the callback to receive balance updates during polling.
   *
   * @param callback - Function to call with balance results.
   */
  setOnBalanceUpdate(callback: OnBalanceUpdateCallback): void {
    this.#onBalanceUpdate = callback;
  }

  /**
   * Execute a poll cycle (required by base class).
   * Fetches balances and calls the update callback.
   *
   * @param input - The polling input.
   */
  async _executePoll(input: BalancePollingInput): Promise<void> {
    const result = await this.#fetchBalances(
      input.chainId,
      input.accountId,
      input.accountAddress,
    );

    if (this.#onBalanceUpdate && result.balances.length > 0) {
      await this.#onBalanceUpdate(result);
    }
  }

  /**
   * Return asset fetch entries tracked in state for the given account and
   * chain. Both native (`slip44:`) and ERC-20 (`erc20:`) entries are included.
   *
   * @param chainId - Hex chain ID (e.g. "0x1").
   * @param accountId - Account UUID.
   * @returns Array of asset fetch entries from state for the requested chain.
   */
  #getAssetsToFetch(chainId: ChainId, accountId: AccountId): AssetFetchEntry[] {
    const state = this.#messenger.call('AssetsController:getState');

    const accountBalances = state?.assetsBalance?.[accountId];
    if (!accountBalances) {
      return [];
    }

    // Convert hex chainId to decimal for CAIP-2 matching
    // This is safe because we are filtring with an accountId that is for evm balances only
    const chainIdDecimal = parseInt(chainId, 16).toString();

    const assetsToFetch = new Map<string, AssetFetchEntry>();

    for (const assetId of Object.keys(accountBalances) as CaipAssetType[]) {
      const {
        chain: { reference: chainReference },
        assetReference,
      } = parseCaipAssetType(assetId);

      if (chainReference === chainIdDecimal) {
        const assetIdLowerCase = assetId.toLowerCase();
        if (assetsToFetch.has(assetIdLowerCase)) {
          continue;
        }

        const isNative = this.#isNativeAsset(assetId);
        const tokenAddress = isNative
          ? ZERO_ADDRESS
          : (assetReference.toLowerCase() as Address);

        assetsToFetch.set(assetIdLowerCase, {
          assetId,
          address: tokenAddress,
        });
      }
    }

    return Array.from(assetsToFetch.values());
  }

  /**
   * Fetch balances for assets already tracked in state for the given
   * account and chain.
   *
   * @param chainId - Hex chain ID.
   * @param accountId - Account UUID.
   * @param accountAddress - On-chain address of the account.
   * @returns Balance fetch result.
   */
  async #fetchBalances(
    chainId: ChainId,
    accountId: AccountId,
    accountAddress: Address,
  ): Promise<BalanceFetchResult> {
    const assets = this.#getAssetsToFetch(chainId, accountId);

    return this.fetchBalancesForAssets(
      chainId,
      accountId,
      accountAddress,
      assets,
    );
  }

  /**
   * Fetch balances for the given assets via multicall.
   *
   * Each entry bundles a CAIP-19 asset ID with its on-chain address and
   * optional decimals.
   *
   * @param chainId - Hex chain ID.
   * @param accountId - Account UUID.
   * @param accountAddress - On-chain address of the account.
   * @param assets - Asset fetch entries to fetch balances for.
   * @returns Balance fetch result.
   */
  async fetchBalancesForAssets(
    chainId: ChainId,
    accountId: AccountId,
    accountAddress: Address,
    assets: AssetFetchEntry[],
  ): Promise<BalanceFetchResult> {
    const timestamp = Date.now();

    // Build a single map keyed by lowercase address that holds all info
    // needed to match multicall responses back to their original entries.
    const balanceRequests: BalanceOfRequest[] = [];
    const entryByAddress = new Map<string, AssetFetchEntry>();

    for (const entry of assets) {
      const lowerAddress = entry.address.toLowerCase();
      if (entryByAddress.has(lowerAddress)) {
        continue; // deduplicate
      }

      entryByAddress.set(lowerAddress, entry);
      balanceRequests.push({ tokenAddress: entry.address, accountAddress });
    }

    if (balanceRequests.length === 0) {
      return {
        chainId,
        accountId,
        accountAddress,
        balances: [],
        failedAddresses: [],
        timestamp,
      };
    }

    type FetchAccumulator = {
      balances: AssetBalance[];
      failedAddresses: Address[];
    };

    const result = await reduceInBatchesSerially<
      BalanceOfRequest,
      FetchAccumulator
    >({
      values: balanceRequests,
      batchSize: this.#config.defaultBatchSize,
      initialResult: {
        balances: [],
        failedAddresses: [],
      },
      eachBatch: async (workingResult, batch) => {
        const responses = await this.#multicallClient.batchBalanceOf(
          chainId,
          batch,
        );

        return this.#processBalanceResponses(
          responses,
          workingResult as FetchAccumulator,
          chainId,
          accountId,
          timestamp,
          entryByAddress,
        );
      },
    });

    return {
      chainId,
      accountId,
      accountAddress,
      ...result,
      timestamp,
    };
  }

  #processBalanceResponses(
    responses: BalanceOfResponse[],
    accumulator: {
      balances: AssetBalance[];
      failedAddresses: Address[];
    },
    chainId: ChainId,
    accountId: AccountId,
    timestamp: number,
    entryByAddress: Map<string, AssetFetchEntry>,
  ): {
    balances: AssetBalance[];
    failedAddresses: Address[];
  } {
    const { balances, failedAddresses } = accumulator;

    for (const response of responses) {
      if (!response.success) {
        failedAddresses.push(response.tokenAddress);
        continue;
      }

      const lowerAddress = response.tokenAddress.toLowerCase();
      const entry = entryByAddress.get(lowerAddress);
      if (!entry) {
        continue;
      }

      const balance = response.balance ?? '0';
      const isNative = lowerAddress === ZERO_ADDRESS.toLowerCase();

      let decimals: number | undefined;
      let formattedBalance: string;
      if (isNative) {
        decimals = 18;
        formattedBalance = this.#formatBalance(balance, decimals);
      } else if (entry.decimals === undefined) {
        formattedBalance = balance;
      } else {
        decimals = entry.decimals;
        formattedBalance = this.#formatBalance(balance, decimals);
      }

      const balanceEntry: AssetBalance = {
        assetId: entry.assetId,
        accountId,
        chainId,
        balance,
        formattedBalance,
        timestamp,
      };
      if (typeof decimals === 'number') {
        balanceEntry.decimals = decimals;
      }
      balances.push(balanceEntry);
    }

    return { balances, failedAddresses };
  }

  #formatBalance(rawBalance: string, decimals: number): string {
    if (rawBalance === '0') {
      return '0';
    }

    try {
      const balanceBigInt = BigInt(rawBalance);
      const divisor = BigInt(10 ** decimals);

      const integerPart = balanceBigInt / divisor;
      const remainder = balanceBigInt % divisor;
      const fractionalStr = remainder.toString().padStart(decimals, '0');
      const trimmedFractional = fractionalStr.replace(/0+$/u, '');

      if (trimmedFractional === '') {
        return integerPart.toString();
      }

      return `${integerPart}.${trimmedFractional}`;
    } catch {
      return rawBalance;
    }
  }
}
