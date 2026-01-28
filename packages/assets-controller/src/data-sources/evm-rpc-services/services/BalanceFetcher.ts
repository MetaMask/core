import { StaticIntervalPollingControllerOnly } from '@metamask/polling-controller';
import type { CaipAssetType } from '@metamask/utils';

import type { MulticallClient } from '../clients';
import type {
  AccountId,
  Address,
  AssetBalance,
  AssetsBalanceState,
  BalanceFetchOptions,
  BalanceFetchResult,
  BalanceOfRequest,
  BalanceOfResponse,
  ChainId,
  TokenFetchInfo,
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
  includeNativeByDefault?: boolean;
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
export type OnBalanceUpdateCallback = (result: BalanceFetchResult) => void;

/**
 * BalanceFetcher - Fetches token balances via multicall.
 * Extends StaticIntervalPollingControllerOnly for built-in polling support.
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
      includeNativeByDefault: config?.includeNativeByDefault ?? true,
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
      this.#onBalanceUpdate(result);
    }
  }

  getTokensToFetch(
    chainId: ChainId,
    accountId: AccountId,
  ): TokenFetchInfo[] {
    const state = this.#messenger.call('AssetsController:getState');

    if (!state?.assetsBalance) {
      return [];
    }

    const accountBalances = state.assetsBalance[accountId];
    if (!accountBalances) {
      return [];
    }

    // Convert hex chainId to decimal for CAIP-2 matching
    const chainIdDecimal = parseInt(chainId, 16);
    const caipChainPrefix = `eip155:${chainIdDecimal}/`;

    const tokenMap = new Map<string, TokenFetchInfo>();

    for (const assetId of Object.keys(accountBalances)) {
      // Only process ERC20 tokens on the current chain
      if (
        assetId.startsWith(caipChainPrefix) &&
        assetId.includes('/erc20:')
      ) {
        // Parse token address from CAIP-19: eip155:1/erc20:0x...
        const tokenAddress = assetId.split('/erc20:')[1] as Address;
        if (tokenAddress) {
          const lowerAddress = tokenAddress.toLowerCase();
          if (!tokenMap.has(lowerAddress)) {
            tokenMap.set(lowerAddress, {
              address: tokenAddress,
              // Decimals will be fetched from metadata or defaulted
              decimals: 18,
              symbol: '',
            });
          }
        }
      }
    }

    return Array.from(tokenMap.values());
  }

  async fetchBalances(
    chainId: ChainId,
    accountId: AccountId,
    accountAddress: Address,
    options?: BalanceFetchOptions,
  ): Promise<BalanceFetchResult> {
    const tokens = this.getTokensToFetch(chainId, accountId);
    const tokenAddresses = tokens.map((token) => token.address);

    return this.fetchBalancesForTokens(
      chainId,
      accountId,
      accountAddress,
      tokenAddresses,
      options,
      tokens,
    );
  }

  async fetchBalancesForTokens(
    chainId: ChainId,
    accountId: AccountId,
    accountAddress: Address,
    tokenAddresses: Address[],
    options?: BalanceFetchOptions,
    tokenInfos?: TokenFetchInfo[],
  ): Promise<BalanceFetchResult> {
    const batchSize = options?.batchSize ?? this.#config.defaultBatchSize;
    const includeNative =
      options?.includeNative ?? this.#config.includeNativeByDefault;
    const timestamp = Date.now();

    const tokenInfoMap = new Map<string, TokenFetchInfo>();
    if (tokenInfos) {
      for (const info of tokenInfos) {
        tokenInfoMap.set(info.address.toLowerCase(), info);
      }
    }

    const balanceRequests: BalanceOfRequest[] = [];

    if (includeNative) {
      balanceRequests.push({
        tokenAddress: ZERO_ADDRESS,
        accountAddress,
      });
    }

    for (const tokenAddress of tokenAddresses) {
      balanceRequests.push({
        tokenAddress,
        accountAddress,
      });
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
          tokenInfoMap,
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
    tokenInfoMap: Map<string, TokenFetchInfo>,
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

      const balance = response.balance ?? '0';
      const tokenInfo = tokenInfoMap.get(response.tokenAddress.toLowerCase());
      const decimals = tokenInfo?.decimals ?? 18;
      const formattedBalance = this.#formatBalance(balance, decimals);

      const chainIdDecimal = parseInt(chainId, 16);
      const isNative =
        response.tokenAddress.toLowerCase() === ZERO_ADDRESS.toLowerCase();
      const assetId: CaipAssetType = isNative
        ? (`eip155:${chainIdDecimal}/slip44:60` as CaipAssetType)
        : (`eip155:${chainIdDecimal}/erc20:${response.tokenAddress.toLowerCase()}` as CaipAssetType);

      balances.push({
        assetId,
        accountId,
        chainId,
        balance,
        formattedBalance,
        decimals,
        timestamp,
      });
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
