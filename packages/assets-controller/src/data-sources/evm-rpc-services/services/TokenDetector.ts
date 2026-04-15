import { StaticIntervalPollingControllerOnly } from '@metamask/polling-controller';
import type { CaipAssetType } from '@metamask/utils';

import { projectLogger, createModuleLogger } from '../../../logger';
import type { MulticallClient } from '../clients';
import type { TokensApiClient } from '../clients/TokensApiClient';
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
} from '../types';
import { reduceInBatchesSerially } from '../utils';

const log = createModuleLogger(projectLogger, 'TokenDetector');

const DEFAULT_DETECTION_INTERVAL = 180_000; // 3 minutes

export type TokenDetectorConfig = {
  /** Function returning whether token detection is enabled (avoids stale value) */
  tokenDetectionEnabled?: () => boolean;
  /** Function returning whether external services are allowed (avoids stale value; default: () => true) */
  useExternalService?: () => boolean;
  defaultBatchSize?: number;
  defaultTimeoutMs?: number;
  /** Polling interval in ms (default: 3 minutes) */
  pollingInterval?: number;
};

/**
 * Polling input for TokenDetector - identifies what to poll for.
 */
export type DetectionPollingInput = {
  /** Chain ID (hex format) */
  chainId: ChainId;
  /** Account ID */
  accountId: AccountId;
  /** Account address */
  accountAddress: Address;
};

/**
 * Callback type for token detection updates.
 */
export type OnDetectionUpdateCallback = (result: TokenDetectionResult) => void;

/**
 * TokenDetector - Detects tokens with non-zero balances via multicall.
 * Fetches the token list from the Tokens API and uses multicall to check balances.
 * Extends StaticIntervalPollingControllerOnly for built-in polling support.
 */
export class TokenDetector extends StaticIntervalPollingControllerOnly<DetectionPollingInput>() {
  readonly #multicallClient: MulticallClient;

  readonly #tokensApiClient: TokensApiClient;

  readonly #config: Required<Omit<TokenDetectorConfig, 'pollingInterval'>>;

  readonly #tokenListCache: Map<ChainId, TokenListEntry[]> = new Map();

  #onDetectionUpdate: OnDetectionUpdateCallback | undefined;

  constructor(
    multicallClient: MulticallClient,
    tokensApiClient: TokensApiClient,
    config?: TokenDetectorConfig,
  ) {
    super();
    this.#multicallClient = multicallClient;
    this.#tokensApiClient = tokensApiClient;
    this.#config = {
      tokenDetectionEnabled:
        config?.tokenDetectionEnabled ?? ((): boolean => true),
      useExternalService: config?.useExternalService ?? ((): boolean => true),
      defaultBatchSize: config?.defaultBatchSize ?? 300,
      defaultTimeoutMs: config?.defaultTimeoutMs ?? 30000,
    };

    this.setIntervalLength(
      config?.pollingInterval ?? DEFAULT_DETECTION_INTERVAL,
    );
  }

  /**
   * Set the callback to receive detection updates during polling.
   *
   * @param callback - Function to call with detection results.
   */
  setOnDetectionUpdate(callback: OnDetectionUpdateCallback): void {
    this.#onDetectionUpdate = callback;
  }

  /**
   * Execute a poll cycle (required by base class).
   * Detects tokens and calls the update callback.
   *
   * @param input - The polling input.
   */
  async _executePoll(input: DetectionPollingInput): Promise<void> {
    try {
      const result = await this.detectTokens(
        input.chainId,
        input.accountId,
        input.accountAddress,
      );

      if (this.#onDetectionUpdate && result.detectedAssets.length > 0) {
        this.#onDetectionUpdate(result);
      }
    } catch (error) {
      log('Token detection poll failed', { chainId: input.chainId, error });
    }
  }

  /**
   * Fetch the list of token addresses to check for the given chain.
   * Calls the Tokens API and caches the result for metadata lookups.
   *
   * @param chainId - Chain ID in hex format.
   * @returns Array of token contract addresses.
   */
  async getTokensToCheck(chainId: ChainId): Promise<Address[]> {
    const tokenList = await this.#fetchAndCacheTokenList(chainId);
    return tokenList.map((entry) => entry.address as Address);
  }

  async detectTokens(
    chainId: ChainId,
    accountId: AccountId,
    accountAddress: Address,
    options?: TokenDetectionOptions,
  ): Promise<TokenDetectionResult> {
    const tokenDetectionEnabled =
      options?.tokenDetectionEnabled ?? this.#config.tokenDetectionEnabled();
    const useExternalService =
      options?.useExternalService ?? this.#config.useExternalService();
    if (!tokenDetectionEnabled || !useExternalService) {
      return {
        chainId,
        accountId,
        accountAddress,
        detectedAssets: [],
        detectedBalances: [],
        zeroBalanceAddresses: [],
        failedAddresses: [],
        timestamp: Date.now(),
      };
    }
    const batchSize = options?.batchSize ?? this.#config.defaultBatchSize;
    const timestamp = Date.now();

    const tokensToCheck = await this.getTokensToCheck(chainId);

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

  async #fetchAndCacheTokenList(chainId: ChainId): Promise<TokenListEntry[]> {
    try {
      const list = await this.#tokensApiClient.fetchTokenList(chainId);
      this.#tokenListCache.set(chainId, list);
      return list;
    } catch (error) {
      const cached = this.#tokenListCache.get(chainId);
      log('Failed to fetch token list; using stale cache', {
        chainId,
        cachedCount: cached?.length ?? 0,
        error,
      });
      return cached ?? [];
    }
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

      if (tokenMetadata?.decimals === undefined) {
        continue;
      }

      const { decimals } = tokenMetadata;
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
    const list = this.#tokenListCache.get(chainId) ?? [];
    const lowerAddress = tokenAddress.toLowerCase();

    const exact = list.find((entry) => entry.address === tokenAddress);
    if (exact) {
      return exact;
    }

    return list.find((entry) => entry.address.toLowerCase() === lowerAddress);
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
