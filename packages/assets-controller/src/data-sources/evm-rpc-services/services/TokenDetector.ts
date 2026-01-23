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
} from '../types';
import { reduceInBatchesSerially } from '../utils';

export type TokenDetectorConfig = {
  defaultBatchSize?: number;
  defaultTimeoutMs?: number;
};

export class TokenDetector {
  readonly #multicallClient: MulticallClient;

  readonly #config: Required<TokenDetectorConfig>;

  #getTokenListState: (() => TokenListState) | undefined;

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

  getTokensToCheck(chainId: ChainId): Address[] {
    const tokenListState = this.#getTokenListState?.();

    if (!tokenListState) {
      return [];
    }

    const chainCacheEntry = tokenListState.tokensChainsCache[chainId];
    const chainTokenList = chainCacheEntry?.data;

    if (!chainTokenList) {
      return [];
    }

    return Object.keys(chainTokenList) as Address[];
  }

  async detectTokens(
    chainId: ChainId,
    accountId: AccountId,
    accountAddress: Address,
    options?: TokenDetectionOptions,
  ): Promise<TokenDetectionResult> {
    const batchSize = options?.batchSize ?? this.#config.defaultBatchSize;
    const timestamp = Date.now();

    const tokensToCheck = this.getTokensToCheck(chainId);

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

    const chainCacheEntry = tokenListState.tokensChainsCache[chainId];
    const chainTokenList = chainCacheEntry?.data;
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
