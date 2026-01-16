import type { CaipAssetType } from '@metamask/utils';

import type { MulticallClient } from '../clients';
import type {
  AccountId,
  Address,
  Asset,
  AssetBalance,
  BalanceOfRequest,
  BalanceOfResponse,
  ChainId,
  TokenDetectionOptions,
  TokenDetectionResult,
  TokenListEntry,
  TokenListState,
  UserTokensState,
} from '../types';
import { reduceInBatchesSerially } from '../utils';

const ZERO_ADDRESS: Address =
  '0x0000000000000000000000000000000000000000' as Address;

export type TokenDetectorConfig = {
  defaultBatchSize?: number;
  defaultTimeoutMs?: number;
};

export class TokenDetector {
  readonly #multicallClient: MulticallClient;

  readonly #config: Required<TokenDetectorConfig>;

  #getTokenListState: (() => TokenListState) | undefined;

  #getUserTokensState: (() => UserTokensState) | undefined;

  constructor(multicallClient: MulticallClient, config?: TokenDetectorConfig) {
    this.#multicallClient = multicallClient;
    this.#config = {
      defaultBatchSize: config?.defaultBatchSize ?? 300,
      defaultTimeoutMs: config?.defaultTimeoutMs ?? 30000,
    };
  }

  setTokenListStateGetter(getTokenListState: () => TokenListState): void {
    this.#getTokenListState = getTokenListState;
  }

  setUserTokensStateGetter(getUserTokensState: () => UserTokensState): void {
    this.#getUserTokensState = getUserTokensState;
  }

  getTokensToCheck(chainId: ChainId, accountAddress: Address): Address[] {
    const tokenListState = this.#getTokenListState?.();
    const userTokensState = this.#getUserTokensState?.();

    console.log('[TokenDetector] getTokensToCheck:', {
      chainId,
      accountAddress,
      hasTokenListState: Boolean(tokenListState),
      tokensChainsCache: tokenListState?.tokensChainsCache
        ? Object.keys(tokenListState.tokensChainsCache)
        : [],
    });

    if (!tokenListState) {
      console.log('[TokenDetector] No tokenListState available');
      return [];
    }

    const chainTokenList = tokenListState.tokensChainsCache[chainId];
    const sampleKeys = chainTokenList
      ? Object.keys(chainTokenList).slice(0, 3)
      : [];
    console.log('[TokenDetector] chainTokenList for', chainId, ':', {
      hasChainTokenList: Boolean(chainTokenList),
      tokenCount: chainTokenList ? Object.keys(chainTokenList).length : 0,
      sampleKeys,
    });

    if (!chainTokenList) {
      console.log('[TokenDetector] No chainTokenList for chain:', chainId);
      return [];
    }

    const allTokenAddresses = Object.keys(chainTokenList) as Address[];
    const knownTokenAddresses = new Set<string>();

    if (userTokensState) {
      const importedTokens =
        userTokensState.allTokens[chainId]?.[accountAddress] ?? [];
      for (const token of importedTokens) {
        knownTokenAddresses.add(token.address.toLowerCase());
      }

      const detectedTokens =
        userTokensState.allDetectedTokens[chainId]?.[accountAddress] ?? [];
      for (const token of detectedTokens) {
        knownTokenAddresses.add(token.address.toLowerCase());
      }

      const ignoredTokens =
        userTokensState.allIgnoredTokens[chainId]?.[accountAddress] ?? [];
      for (const tokenAddress of ignoredTokens) {
        knownTokenAddresses.add(tokenAddress.toLowerCase());
      }
    }

    return allTokenAddresses.filter((address) => {
      const lowerAddress = address.toLowerCase();
      return (
        lowerAddress !== ZERO_ADDRESS.toLowerCase() &&
        !knownTokenAddresses.has(lowerAddress)
      );
    });
  }

  async detectTokens(
    chainId: ChainId,
    accountId: AccountId,
    accountAddress: Address,
    options?: TokenDetectionOptions,
  ): Promise<TokenDetectionResult> {
    const batchSize = options?.batchSize ?? this.#config.defaultBatchSize;
    const timestamp = Date.now();

    console.log('[TokenDetector] detectTokens called:', {
      chainId,
      accountId,
      accountAddress,
    });

    const tokensToCheck = this.getTokensToCheck(chainId, accountAddress);

    console.log('[TokenDetector] tokensToCheck count:', tokensToCheck.length);

    if (tokensToCheck.length === 0) {
      console.log('[TokenDetector] No tokens to check, returning empty result');
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

    const balanceRequests: BalanceOfRequest[] = tokensToCheck.map(
      (tokenAddress) => ({
        tokenAddress,
        accountAddress,
      }),
    );

    type DetectionAccumulator = {
      detectedAssets: Asset[];
      detectedBalances: AssetBalance[];
      zeroBalanceAddresses: Address[];
      failedAddresses: Address[];
    };

    console.log(
      '[TokenDetector] Starting batch processing with batchSize:',
      batchSize,
    );
    const startTime = performance.now();

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
        console.log(
          '[TokenDetector] Processing batch of',
          batch.length,
          'tokens',
        );
        const responses = await this.#multicallClient.batchBalanceOf(
          chainId,
          batch,
        );

        console.log(
          '[TokenDetector] Batch responses received:',
          responses.length,
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

    const duration = performance.now() - startTime;
    console.log(
      `[TokenDetector] Detection completed in ${duration.toFixed(2)}ms:`,
      {
        detectedAssets: result.detectedAssets.length,
        detectedBalances: result.detectedBalances.length,
        zeroBalanceAddresses: result.zeroBalanceAddresses.length,
        failedAddresses: result.failedAddresses.length,
      },
    );

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

      if (balance === '0' || balance === '') {
        zeroBalanceAddresses.push(response.tokenAddress);
        continue;
      }

      const tokenMetadata = this.#getTokenMetadata(
        chainId,
        response.tokenAddress,
      );

      const asset = this.#createAsset(
        chainId,
        response.tokenAddress,
        tokenMetadata,
      );
      detectedAssets.push(asset);

      const decimals = tokenMetadata?.decimals ?? 18;
      const formattedBalance = this.#formatBalance(balance, decimals);

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

    if (chainTokenList[tokenAddress]) {
      return chainTokenList[tokenAddress];
    }

    const lowerAddress = tokenAddress.toLowerCase();
    for (const [address, metadata] of Object.entries(chainTokenList)) {
      if (address.toLowerCase() === lowerAddress) {
        return metadata;
      }
    }

    return undefined;
  }

  #createAsset(
    chainId: ChainId,
    tokenAddress: Address,
    metadata: TokenListEntry | undefined,
  ): Asset {
    const chainIdDecimal = parseInt(chainId, 16);

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
