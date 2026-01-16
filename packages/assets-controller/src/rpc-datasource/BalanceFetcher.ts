import type { CaipAssetType } from '@metamask/utils';

import type {
  IBalanceFetcher,
  IMulticallClient,
  BalanceFetchOptions,
  BalanceFetchResult,
  BalanceOfRequest,
  BalanceOfResponse,
  TokenFetchInfo,
} from './interfaces';
import type {
  AccountId,
  Address,
  AssetBalance,
  ChainId,
  UserToken,
  UserTokensState,
} from './types';
import { reduceInBatchesSerially } from './utils';

// =============================================================================
// CONSTANTS
// =============================================================================

/**
 * Zero address constant for native token.
 */
const ZERO_ADDRESS: Address =
  '0x0000000000000000000000000000000000000000' as Address;

/**
 * BalanceFetcher configuration.
 */
export type BalanceFetcherConfig = {
  /** Default batch size for balance fetching */
  defaultBatchSize?: number;
  /** Default timeout in milliseconds */
  defaultTimeoutMs?: number;
  /** Include native token by default */
  includeNativeByDefault?: boolean;
  /** Include staked balance by default */
  includeStakedByDefault?: boolean;
};

/**
 * BalanceFetcher - Fetches token balances for an account.
 *
 * Uses the user's imported + detected tokens list and
 * Multicall3 to batch balanceOf calls for efficiency.
 */
export class BalanceFetcher implements IBalanceFetcher {
  readonly #multicallClient: IMulticallClient;

  readonly #config: Required<BalanceFetcherConfig>;

  #getUserTokensState: (() => UserTokensState) | undefined;

  constructor(
    multicallClient: IMulticallClient,
    config?: BalanceFetcherConfig,
  ) {
    this.#multicallClient = multicallClient;
    this.#config = {
      defaultBatchSize: config?.defaultBatchSize ?? 100,
      defaultTimeoutMs: config?.defaultTimeoutMs ?? 30000,
      includeNativeByDefault: config?.includeNativeByDefault ?? true,
      includeStakedByDefault: config?.includeStakedByDefault ?? false,
    };
  }

  setUserTokensStateGetter(getUserTokensState: () => UserTokensState): void {
    this.#getUserTokensState = getUserTokensState;
  }

  /**
   * Get tokens to fetch with their metadata (address, decimals).
   *
   * @param chainId - Chain ID.
   * @param accountAddress - Account address.
   * @returns Array of token info with addresses and decimals.
   */
  getTokensToFetch(
    chainId: ChainId,
    accountAddress: Address,
  ): TokenFetchInfo[] {
    console.log('[BalanceFetcher] getTokensToFetch called:', {
      chainId,
      accountAddress,
    });

    const userTokensState = this.#getUserTokensState?.();

    if (!userTokensState) {
      console.log('[BalanceFetcher] No userTokensState, returning empty array');
      return [];
    }

    const tokenMap = new Map<string, TokenFetchInfo>();

    // Helper to add token to map
    const addToken = (token: UserToken): void => {
      const lowerAddress = token.address.toLowerCase();
      if (!tokenMap.has(lowerAddress)) {
        tokenMap.set(lowerAddress, {
          address: token.address,
          decimals: token.decimals,
          symbol: token.symbol,
        });
      }
    };

    // Get imported tokens for account on chain
    const importedTokens =
      userTokensState.allTokens[chainId]?.[accountAddress] ?? [];
    for (const token of importedTokens) {
      addToken(token);
    }

    // Get detected tokens for account on chain
    const detectedTokens =
      userTokensState.allDetectedTokens[chainId]?.[accountAddress] ?? [];
    for (const token of detectedTokens) {
      addToken(token);
    }

    const tokens = Array.from(tokenMap.values());
    console.log('[BalanceFetcher] Found tokens to fetch:', tokens.length);

    return tokens;
  }

  async fetchBalances(
    chainId: ChainId,
    accountId: AccountId,
    accountAddress: Address,
    options?: BalanceFetchOptions,
  ): Promise<BalanceFetchResult> {
    const tokens = this.getTokensToFetch(chainId, accountAddress);
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

    console.log('[BalanceFetcher] fetchBalancesForTokens:', {
      chainId,
      accountId,
      tokenCount: tokenAddresses.length,
      includeNative,
    });

    // Build token info map for decimals lookup
    const tokenInfoMap = new Map<string, TokenFetchInfo>();
    if (tokenInfos) {
      for (const info of tokenInfos) {
        tokenInfoMap.set(info.address.toLowerCase(), info);
      }
    }

    // Build balance requests
    const balanceRequests: BalanceOfRequest[] = [];

    // Optionally add native token
    if (includeNative) {
      balanceRequests.push({
        tokenAddress: ZERO_ADDRESS,
        accountAddress,
      });
    }

    // Add ERC20 tokens
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

    // Result accumulator type
    type FetchAccumulator = {
      balances: AssetBalance[];
      failedAddresses: Address[];
    };

    // Process in batches using reduceInBatchesSerially
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

    console.log('[BalanceFetcher] Fetch complete:', {
      balanceCount: result.balances.length,
      failedCount: result.failedAddresses.length,
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
   * Process balance responses and accumulate results.
   *
   * @param responses Array of balance responses from RPC calls.
   * @param accumulator Accumulator object.
   * @param accumulator.balances Array of AssetBalance results.
   * @param accumulator.failedAddresses Array of failed token addresses.
   * @param chainId Chain ID.
   * @param accountId Account ID.
   * @param timestamp Timestamp for balances.
   * @param tokenInfoMap Map of token addresses to TokenFetchInfo.
   * @returns Object containing updated balances and failed addresses.
   */
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

      // Get decimals from token info (default to 18)
      const tokenInfo = tokenInfoMap.get(response.tokenAddress.toLowerCase());
      const decimals = tokenInfo?.decimals ?? 18;

      // Calculate formatted balance
      const formattedBalance = this.#formatBalance(balance, decimals);

      // Build CAIP-19 asset ID
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

    return {
      balances,
      failedAddresses,
    };
  }

  /**
   * Format a raw balance using token decimals.
   *
   * @param rawBalance - Raw balance as string (in smallest units).
   * @param decimals - Token decimals.
   * @returns Human-readable balance string.
   */
  #formatBalance(rawBalance: string, decimals: number): string {
    if (rawBalance === '0') {
      return '0';
    }

    try {
      const balanceBigInt = BigInt(rawBalance);
      const divisor = BigInt(10 ** decimals);

      // Integer part
      const integerPart = balanceBigInt / divisor;

      // Fractional part (padded to decimals length)
      const remainder = balanceBigInt % divisor;
      const fractionalStr = remainder.toString().padStart(decimals, '0');

      // Trim trailing zeros from fractional part
      const trimmedFractional = fractionalStr.replace(/0+$/u, '');

      if (trimmedFractional === '') {
        return integerPart.toString();
      }

      return `${integerPart}.${trimmedFractional}`;
    } catch {
      // If parsing fails, return the raw balance
      return rawBalance;
    }
  }
}
