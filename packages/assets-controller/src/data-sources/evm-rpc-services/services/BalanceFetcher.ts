import { StaticIntervalPollingControllerOnly } from '@metamask/polling-controller';

import type { MulticallClient } from '../clients';
import type {
  AccountId,
  Address,
  AssetBalance,
  AssetFetchEntry,
  AssetsBalanceState,
  BalanceFetchOptions,
  BalanceFetchResult,
  BalanceOfRequest,
  BalanceOfResponse,
  ChainId,
} from '../types';
import { reduceInBatchesSerially } from '../utils';

const DEFAULT_BALANCE_INTERVAL = 30_000; // 30 seconds

const ZERO_ADDRESS: Address =
  '0x0000000000000000000000000000000000000000' as Address;

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

  readonly #config: Required<Omit<BalanceFetcherConfig, 'pollingInterval'>>;

  #onBalanceUpdate: OnBalanceUpdateCallback | undefined;

  constructor(
    multicallClient: MulticallClient,
    messenger: BalanceFetcherMessenger,
    config?: BalanceFetcherConfig,
  ) {
    super();
    this.#multicallClient = multicallClient;
    this.#messenger = messenger;
    this.#config = {
      defaultBatchSize: config?.defaultBatchSize ?? 300,
      defaultTimeoutMs: config?.defaultTimeoutMs ?? 30000,
    };

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
    const result = await this.fetchBalances(
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
  getAssetsToFetch(chainId: ChainId, accountId: AccountId): AssetFetchEntry[] {
    const state = this.#messenger.call('AssetsController:getState');

    if (!state?.assetsBalance) {
      return [];
    }

    const accountBalances = state.assetsBalance[accountId];
    if (!accountBalances) {
      return [];
    }

    const chainIdDecimal = parseInt(chainId, 16);
    const caipChainPrefix = `eip155:${chainIdDecimal}/`;

    const seen = new Set<string>();
    const entries: AssetFetchEntry[] = [];

    for (const rawAssetId of Object.keys(accountBalances)) {
      if (rawAssetId.startsWith(caipChainPrefix)) {
        const lower = rawAssetId.toLowerCase();
        if (!seen.has(lower)) {
          seen.add(lower);
          entries.push(BalanceFetcher.#assetIdToEntry(rawAssetId));
        }
      }
    }

    return entries;
  }

  /**
   * Fetch balances for assets already tracked in state for the given
   * account and chain.
   *
   * @param chainId - Hex chain ID.
   * @param accountId - Account UUID.
   * @param accountAddress - On-chain address of the account.
   * @param options - Optional fetch options (batch size, timeout).
   * @returns Balance fetch result.
   */
  async fetchBalances(
    chainId: ChainId,
    accountId: AccountId,
    accountAddress: Address,
    options?: BalanceFetchOptions,
  ): Promise<BalanceFetchResult> {
    const assets = this.getAssetsToFetch(chainId, accountId);

    return this.fetchBalancesForAssets(
      accountId,
      accountAddress,
      assets,
      options,
    );
  }

  /**
   * Fetch balances for the given assets via multicall.
   *
   * Each entry bundles a CAIP-19 asset ID with its on-chain address and
   * optional metadata (decimals, symbol), so callers never need to maintain
   * separate parallel arrays.
   *
   * @param accountId - Account UUID.
   * @param accountAddress - On-chain address of the account.
   * @param assets - Asset fetch entries to fetch balances for.
   * @param options - Optional fetch options (batch size, timeout).
   * @returns Balance fetch result.
   */
  async fetchBalancesForAssets(
    accountId: AccountId,
    accountAddress: Address,
    assets: AssetFetchEntry[],
    options?: BalanceFetchOptions,
  ): Promise<BalanceFetchResult> {
    const batchSize = options?.batchSize ?? this.#config.defaultBatchSize;
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
        chainId: '0x0' as ChainId,
        accountId,
        accountAddress,
        balances: [],
        failedAddresses: [],
        timestamp,
      };
    }

    // Derive hex chainId from the first entry's asset ID
    const chainRef = assets[0].assetId.split('/')[0].split(':')[1];
    const chainId: ChainId = `0x${parseInt(chainRef, 10).toString(16)}`;

    type FetchAccumulator = {
      balances: AssetBalance[];
      failedAddresses: Address[];
    };

    const result = await reduceInBatchesSerially<
      BalanceOfRequest,
      FetchAccumulator
    >({
      values: balanceRequests,
      batchSize,
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

  /**
   * Convert a raw CAIP-19 asset ID string into an {@link AssetFetchEntry}.
   *
   * @param rawAssetId - CAIP-19 asset ID string.
   * @returns An entry with the address extracted (zero address for native).
   */
  static #assetIdToEntry(rawAssetId: string): AssetFetchEntry {
    const isNative = rawAssetId.includes('/slip44:');
    let address: Address;

    if (isNative) {
      address = ZERO_ADDRESS;
    } else {
      const erc20Part = rawAssetId.split('/erc20:')[1];
      address = erc20Part ? (erc20Part.toLowerCase() as Address) : ZERO_ADDRESS;
    }

    return {
      assetId: rawAssetId as AssetFetchEntry['assetId'],
      address,
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
