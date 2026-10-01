import {
  ChainId as ControllerChainId,
  convertHexToDecimal,
} from '@metamask/controller-utils';
import type { ApiPlatformClient, TokenMetadata } from '@metamask/core-backend';
import { StaticIntervalPollingControllerOnly } from '@metamask/polling-controller';
import type { CaipAssetType } from '@metamask/utils';

import { projectLogger, createModuleLogger } from '../../../logger.js';
import type { MulticallClient } from '../clients/index.js';
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
} from '../types/index.js';
import { reduceInBatchesSerially } from '../utils/index.js';

const log = createModuleLogger(projectLogger, 'TokenDetector');

const DEFAULT_DETECTION_INTERVAL = 180_000; // 3 minutes

/**
 * Fallback `occurrenceFloor` when `/v1/suggestedOccurrenceFloors` has no entry
 * for the chain, or the floors request fails.
 */
const DEFAULT_OCCURRENCE_FLOOR = 3;

/** The slice of the API platform client the detector reads token lists from. */
export type TokenDetectorApiClient = Pick<ApiPlatformClient, 'token'>;

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
 *
 * Fetches the per-chain ERC-20 token list from the Token API via the shared
 * `ApiPlatformClient` (`token.api.cx.metamask.io/tokens/{chainId}`, the same
 * endpoint `TokenListController` uses) and uses multicall to check balances.
 *
 * Before fetching a chain's list, the detector checks the Token API
 * `/v2/supportedNetworks` and skips detection for chains that are not listed.
 * The `occurrenceFloor` query param comes from `/v1/suggestedOccurrenceFloors`
 * (fallback {@link DEFAULT_OCCURRENCE_FLOOR}), matching `TokenDataSource` spam
 * filtering. Linea's aggregator filter is applied client-side. Caching and
 * request deduplication for all three endpoints is handled by
 * `ApiPlatformClient`'s TanStack Query cache.
 *
 * Extends StaticIntervalPollingControllerOnly for built-in polling support.
 */
export class TokenDetector extends StaticIntervalPollingControllerOnly<DetectionPollingInput>() {
  readonly #multicallClient: MulticallClient;

  readonly #apiClient: TokenDetectorApiClient;

  readonly #config: Required<Omit<TokenDetectorConfig, 'pollingInterval'>>;

  readonly #tokenListCache: Map<ChainId, TokenListEntry[]> = new Map();

  #onDetectionUpdate: OnDetectionUpdateCallback | undefined;

  constructor(
    multicallClient: MulticallClient,
    apiClient: TokenDetectorApiClient,
    config?: TokenDetectorConfig,
  ) {
    super();
    this.#multicallClient = multicallClient;
    this.#apiClient = apiClient;
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
   * Calls the Token API and caches the result for metadata lookups.
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
      const list = await this.#fetchTokenList(chainId);
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

  /**
   * Fetch the ERC-20 token list for a chain from the Token API.
   *
   * Returns `[]` without hitting the token-list endpoint when the chain is
   * not in `/v2/supportedNetworks` (or that check fails). Token-list request
   * failures propagate to the caller, which falls back to the stale cache.
   *
   * @param chainId - Chain ID in hex format.
   * @returns Token list entries for the chain, after chain-specific filters.
   */
  async #fetchTokenList(chainId: ChainId): Promise<TokenListEntry[]> {
    if (!(await this.#isSupportedChain(chainId))) {
      return [];
    }

    const occurrenceFloor = await this.#getOccurrenceFloor(chainId);

    // Same query shape as `TokenListController.getTokensURL` (token-service.ts),
    // but `occurrenceFloor` comes from `/v1/suggestedOccurrenceFloors`.
    // No `first=...` cap — the API returns the full per-chain list bounded
    // server-side by `occurrenceFloor`.
    const items = await this.#apiClient.token.fetchTokenList(
      convertHexToDecimal(chainId),
      {
        occurrenceFloor,
        includeNativeAssets: false,
        includeTokenFees: false,
        includeAssetType: false,
        includeERC20Permit: false,
        includeStorage: false,
        includeRwaData: true,
      },
    );

    return applyChainSpecificFilters(
      chainId,
      Array.isArray(items) ? items : [],
    ).map(toTokenListEntry);
  }

  /**
   * Check whether the Token API serves a token list for the given chain.
   * Any failure of the supported-networks request is treated as "not
   * supported" so the token-list endpoint is only contacted for known chains.
   *
   * @param chainId - Chain ID in hex format.
   * @returns `true` when the chain is in `fullSupport` or `partialSupport`.
   */
  async #isSupportedChain(chainId: ChainId): Promise<boolean> {
    try {
      const { fullSupport, partialSupport } =
        await this.#apiClient.token.fetchV2SupportedNetworks();
      const caipChainId = `eip155:${convertHexToDecimal(chainId)}`;
      return [...fullSupport, ...partialSupport].includes(caipChainId);
    } catch (error) {
      log('Failed to fetch supported networks; skipping detection', {
        chainId,
        error,
      });
      return false;
    }
  }

  /**
   * Resolve the `occurrenceFloor` query param for a chain from the Token API
   * `/v1/suggestedOccurrenceFloors`. Falls back to
   * {@link DEFAULT_OCCURRENCE_FLOOR} when the chain is missing or the request
   * fails.
   *
   * @param chainId - Chain ID in hex format.
   * @returns Occurrence floor to send to `/tokens/{chainId}`.
   */
  async #getOccurrenceFloor(chainId: ChainId): Promise<number> {
    try {
      const floors =
        await this.#apiClient.token.fetchV1SuggestedOccurrenceFloors();
      return (
        floors[String(convertHexToDecimal(chainId))] ?? DEFAULT_OCCURRENCE_FLOOR
      );
    } catch (error) {
      log('Failed to fetch suggested occurrence floors; using default', {
        chainId,
        error,
      });
      return DEFAULT_OCCURRENCE_FLOOR;
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

/**
 * Apply chain-specific filters to a raw token list response, mirroring
 * `fetchTokenListByChainId` in `assets-controllers/src/token-service.ts`.
 *
 * For Linea mainnet, the API returns extras with low aggregator coverage, so
 * we keep only entries flagged by Linea's own team or seen by ≥3 aggregators.
 *
 * @param chainId - Chain ID in hex format.
 * @param items - Raw items from the API response.
 * @returns Items after chain-specific filtering.
 */
function applyChainSpecificFilters(
  chainId: ChainId,
  items: TokenMetadata[],
): TokenMetadata[] {
  if (chainId === ControllerChainId['linea-mainnet']) {
    return items.filter((item) => {
      const aggregators = item.aggregators ?? [];
      return aggregators.includes('lineaTeam') || aggregators.length >= 3;
    });
  }
  return items;
}

/**
 * Map a Token API list item to the detector's `TokenListEntry`, defaulting
 * fields the API occasionally omits despite its typed contract.
 *
 * @param item - Raw item from the API response.
 * @returns The token list entry.
 */
function toTokenListEntry(item: TokenMetadata): TokenListEntry {
  return {
    address: item.address,
    symbol: item.symbol ?? '',
    name: item.name ?? '',
    decimals: item.decimals ?? 18,
    iconUrl: item.iconUrl,
    aggregators: item.aggregators,
    occurrences: item.occurrences,
  };
}
