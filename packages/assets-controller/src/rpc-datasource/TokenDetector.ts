import type { CaipAssetType } from '@metamask/utils';

import type {
  BalanceOfRequest,
  BalanceOfResponse,
  IMulticallClient,
  ITokenDetector,
  TokenDetectionOptions,
  TokenDetectionResult,
} from './interfaces';
import type {
  AccountId,
  Address,
  Asset,
  AssetBalance,
  ChainId,
  TokenListEntry,
  TokenListState,
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

// =============================================================================
// TOKEN DETECTOR
// =============================================================================

/**
 * TokenDetector configuration.
 */
export type TokenDetectorConfig = {
  /** Default batch size for detection */
  defaultBatchSize?: number;
  /** Default timeout in milliseconds */
  defaultTimeoutMs?: number;
};

/**
 * TokenDetector - Detects new ERC-20 tokens for an account.
 *
 * Uses the token list to determine which contracts to check,
 * filters out already imported/detected tokens, and uses
 * Multicall3 to batch balanceOf calls for efficiency.
 */
export class TokenDetector implements ITokenDetector {
  readonly #multicallClient: IMulticallClient;

  readonly #config: Required<TokenDetectorConfig>;

  #getTokenListState: (() => TokenListState) | undefined;

  #getUserTokensState: (() => UserTokensState) | undefined;

  constructor(multicallClient: IMulticallClient, config?: TokenDetectorConfig) {
    this.#multicallClient = multicallClient;
    this.#config = {
      defaultBatchSize: config?.defaultBatchSize ?? 100,
      defaultTimeoutMs: config?.defaultTimeoutMs ?? 30000,
    };
  }

  /**
   * Set the token list state source.
   *
   * @param getTokenListState - Function to get current token list state.
   */
  setTokenListStateGetter(getTokenListState: () => TokenListState): void {
    this.#getTokenListState = getTokenListState;
  }

  /**
   * Set the user tokens state source.
   *
   * @param getUserTokensState - Function to get current user tokens state.
   */
  setUserTokensStateGetter(getUserTokensState: () => UserTokensState): void {
    this.#getUserTokensState = getUserTokensState;
  }

  /**
   * Get tokens to check from token list (excluding already known tokens).
   *
   * @param chainId - Chain ID.
   * @param accountAddress - Account address.
   * @returns Array of token addresses to check.
   */
  getTokensToCheck(chainId: ChainId, accountAddress: Address): Address[] {
    console.log('[TokenDetector] getTokensToCheck called:', {
      chainId,
      accountAddress,
    });

    const tokenListState = this.#getTokenListState?.();
    console.log(
      '[TokenDetector] tokenListState +++++++++++++++++:',
      tokenListState,
      null,
      2,
    );
    const userTokensState = this.#getUserTokensState?.();

    console.log(
      '[TokenDetector] tokenListState exists:',
      Boolean(tokenListState),
    );
    console.log(
      '[TokenDetector] userTokensState exists:',
      Boolean(userTokensState),
    );

    if (!tokenListState) {
      console.log('[TokenDetector] No tokenListState, returning empty array');
      return [];
    }

    console.log(
      '[TokenDetector] tokensChainsCache keys:',
      Object.keys(tokenListState.tokensChainsCache),
    );

    // Get all tokens from token list for this chain
    const chainTokenList = tokenListState.tokensChainsCache[chainId];
    if (!chainTokenList) {
      console.log(
        '[TokenDetector] No chainTokenList for chainId:',
        chainId,
        ', returning empty array',
      );
      return [];
    }

    console.log(
      '[TokenDetector] chainTokenList size:',
      Object.keys(chainTokenList).length,
    );

    const allTokenAddresses = Object.keys(chainTokenList) as Address[];

    console.log(
      '[TokenDetector] allTokenAddresses ++++++++++++++:',
      allTokenAddresses,
    );

    // Get already known tokens for this account
    const knownTokenAddresses = new Set<string>();

    if (userTokensState) {
      // Add imported tokens
      const importedTokens =
        userTokensState.allTokens[chainId]?.[accountAddress] ?? [];
      for (const token of importedTokens) {
        knownTokenAddresses.add(token.address.toLowerCase());
      }

      // Add detected tokens
      const detectedTokens =
        userTokensState.allDetectedTokens[chainId]?.[accountAddress] ?? [];
      for (const token of detectedTokens) {
        knownTokenAddresses.add(token.address.toLowerCase());
      }

      // Add ignored tokens
      const ignoredTokens =
        userTokensState.allIgnoredTokens[chainId]?.[accountAddress] ?? [];
      for (const tokenAddress of ignoredTokens) {
        knownTokenAddresses.add(tokenAddress.toLowerCase());
      }
    }

    // Filter out known tokens and native token
    const filteredTokenAddresses = allTokenAddresses.filter((address) => {
      const lowerAddress = address.toLowerCase();
      return (
        lowerAddress !== ZERO_ADDRESS.toLowerCase() &&
        !knownTokenAddresses.has(lowerAddress)
      );
    });

    console.log('salim ++++++++++++++:', filteredTokenAddresses);

    return filteredTokenAddresses;
  }

  /**
   * Detect new tokens for an account on a specific chain.
   *
   * Uses the token list to determine which contracts to check,
   * filters out already imported/detected tokens, and uses
   * Multicall3 to batch balanceOf calls.
   *
   * @param chainId - Chain ID to detect tokens on.
   * @param accountId - Account ID to detect tokens for.
   * @param accountAddress - Account address to check balances for.
   * @param options - Optional detection options.
   * @returns Detection result with newly found tokens.
   */
  async detectTokens(
    chainId: ChainId,
    accountId: AccountId,
    accountAddress: Address,
    options?: TokenDetectionOptions,
  ): Promise<TokenDetectionResult> {
    const batchSize = options?.batchSize ?? this.#config.defaultBatchSize;
    const timestamp = Date.now();

    // Get tokens to check
    const tokensToCheck = this.getTokensToCheck(chainId, accountAddress);

    console.log('tokensToCheck ++++++++++++++', tokensToCheck);

    if (tokensToCheck.length === 0) {
      return {
        chainId,
        accountId,
        accountAddress,
        detectedAssets: [],
        detectedBalances: [],
        zeroBalanceAddresses: [],
        failedAddresses: [],
        timestamp,
      };
    }

    // Build balance requests
    const balanceRequests: BalanceOfRequest[] = tokensToCheck.map(
      (tokenAddress) => ({
        tokenAddress,
        accountAddress,
      }),
    );

    // Result accumulator type
    type DetectionAccumulator = {
      detectedAssets: Asset[];
      detectedBalances: AssetBalance[];
      zeroBalanceAddresses: Address[];
      failedAddresses: Address[];
    };

    // Process in batches using reduceInBatchesSerially
    const result = await reduceInBatchesSerially<
      BalanceOfRequest,
      DetectionAccumulator
    >({
      values: balanceRequests,
      batchSize,
      initialResult: {
        detectedAssets: [],
        detectedBalances: [],
        zeroBalanceAddresses: [],
        failedAddresses: [],
      },
      eachBatch: async (workingResult, batch) => {
        const responses = await this.#multicallClient.batchBalanceOf(
          chainId,
          batch,
        );

        return this.#processBalanceResponses(
          responses,
          workingResult as DetectionAccumulator,
          chainId,
          accountId,
          timestamp,
        );
      },
    });

    console.log('result ++++++++++++++', JSON.stringify(result, null, 2));

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
   * @param responses - Balance responses from multicall.
   * @param accumulator - Current accumulated results.
   * @param accumulator.detectedAssets - Already detected assets.
   * @param accumulator.detectedBalances - Already detected balances.
   * @param accumulator.zeroBalanceAddresses - Addresses with zero balance.
   * @param accumulator.failedAddresses - Addresses that failed to fetch.
   * @param chainId - Chain ID.
   * @param accountId - Account ID.
   * @param timestamp - Detection timestamp.
   * @returns Updated accumulator with processed responses.
   */
  #processBalanceResponses(
    responses: BalanceOfResponse[],
    accumulator: {
      detectedAssets: Asset[];
      detectedBalances: AssetBalance[];
      zeroBalanceAddresses: Address[];
      failedAddresses: Address[];
    },
    chainId: ChainId,
    accountId: AccountId,
    timestamp: number,
  ): {
    detectedAssets: Asset[];
    detectedBalances: AssetBalance[];
    zeroBalanceAddresses: Address[];
    failedAddresses: Address[];
  } {
    const {
      detectedAssets,
      detectedBalances,
      zeroBalanceAddresses,
      failedAddresses,
    } = accumulator;

    for (const response of responses) {
      if (!response.success) {
        failedAddresses.push(response.tokenAddress);
        continue;
      }

      const balance = response.balance ?? '0';

      // Check if balance is non-zero
      if (balance === '0' || balance === '') {
        zeroBalanceAddresses.push(response.tokenAddress);
        continue;
      }

      // Get token metadata from token list
      const tokenMetadata = this.#getTokenMetadata(
        chainId,
        response.tokenAddress,
      );

      // Create asset with metadata if available, or with minimal info
      const asset = this.#createAsset(
        chainId,
        response.tokenAddress,
        tokenMetadata,
      );
      detectedAssets.push(asset);

      // Get decimals from metadata (default to 18 if not available)
      const decimals = tokenMetadata?.decimals ?? 18;

      // Calculate formatted balance
      const formattedBalance = this.#formatBalance(balance, decimals);

      // Also create balance entry for this detected asset
      detectedBalances.push({
        assetId: asset.assetId,
        accountId,
        chainId,
        balance,
        formattedBalance,
        decimals,
        timestamp,
      });
    }

    return {
      detectedAssets,
      detectedBalances,
      zeroBalanceAddresses,
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

  /**
   * Get token metadata from the token list.
   *
   * @param chainId - Chain ID.
   * @param tokenAddress - Token address.
   * @returns Token metadata or undefined.
   */
  #getTokenMetadata(
    chainId: ChainId,
    tokenAddress: Address,
  ): TokenListEntry | undefined {
    const tokenListState = this.#getTokenListState?.();
    if (!tokenListState) {
      return undefined;
    }

    const chainTokenList = tokenListState.tokensChainsCache[chainId];
    if (!chainTokenList) {
      return undefined;
    }

    // Try exact match first
    if (chainTokenList[tokenAddress]) {
      return chainTokenList[tokenAddress];
    }

    // Try case-insensitive match
    const lowerAddress = tokenAddress.toLowerCase();
    for (const [address, metadata] of Object.entries(chainTokenList)) {
      if (address.toLowerCase() === lowerAddress) {
        return metadata;
      }
    }

    return undefined;
  }

  /**
   * Create an Asset object from token metadata.
   *
   * @param chainId - Chain ID.
   * @param tokenAddress - Token address.
   * @param metadata - Token metadata from token list.
   * @returns Asset object.
   */
  #createAsset(
    chainId: ChainId,
    tokenAddress: Address,
    metadata: TokenListEntry | undefined,
  ): Asset {
    // Convert chainId from hex to decimal for CAIP format
    const chainIdDecimal = parseInt(chainId, 16);

    // Build CAIP-19 asset ID: eip155:{chainId}/erc20:{address}
    const assetId =
      `eip155:${chainIdDecimal}/erc20:${tokenAddress.toLowerCase()}` as CaipAssetType;

    return {
      assetId,
      chainId,
      address: tokenAddress,
      type: 'erc20',
      symbol: metadata?.symbol,
      name: metadata?.name,
      decimals: metadata?.decimals,
      image: metadata?.iconUrl,
      isNative: false,
      aggregators: metadata?.aggregators,
    };
  }
}
