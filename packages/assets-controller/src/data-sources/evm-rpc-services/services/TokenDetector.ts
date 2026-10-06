import {
  ChainId as ControllerChainId,
  convertHexToDecimal,
} from '@metamask/controller-utils';
import type { TokenApiClient } from '@metamask/core-backend';
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

/**
 * Fallback `occurrenceFloor` when `/v1/suggestedOccurrenceFloors` has no entry
 * for the chain, or the floors request fails.
 */
const DEFAULT_OCCURRENCE_FLOOR = 3;

/** How long to keep `/v2/supportedNetworks` cached. */
const SUPPORTED_NETWORKS_CACHE_TTL_MS = 60 * 60_000;

/** How long to keep `/v1/suggestedOccurrenceFloors` cached. */
const SUGGESTED_OCCURRENCE_FLOORS_CACHE_TTL_MS = 60 * 60_000;

/**
 * Token-list cache window used when the caller shares a QueryClient.
 * Without one, the list is refetched on every call.
 */
const TOKEN_LIST_STALE_TIME_MS = 5 * 60_000;
const TOKEN_LIST_GC_TIME_MS = 60 * 60_000;

type ApiTokenListItem = {
  address: string;
  symbol?: string;
  name?: string;
  decimals?: number;
  occurrences?: number;
  aggregators?: string[];
  iconUrl?: string;
};

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
  /**
   * When true, cache the per-chain token list on the shared QueryClient.
   * `RpcDataSource` sets this because it uses `queryApiClient.token`.
   */
  cacheTokenList?: boolean;
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

  readonly #tokenApi: TokenApiClient;

  readonly #cacheTokenList: boolean;

  readonly #config: Required<
    Omit<TokenDetectorConfig, 'pollingInterval' | 'cacheTokenList'>
  >;

  readonly #tokenListCache: Map<ChainId, TokenListEntry[]> = new Map();

  #onDetectionUpdate: OnDetectionUpdateCallback | undefined;

  constructor(
    multicallClient: MulticallClient,
    tokenApi: TokenApiClient,
    config?: TokenDetectorConfig,
  ) {
    super();
    this.#multicallClient = multicallClient;
    this.#tokenApi = tokenApi;
    this.#cacheTokenList = config?.cacheTokenList ?? false;
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
    const tokenList = await this.getTokenList(chainId);
    return tokenList.map((entry) => entry.address as Address);
  }

  /**
   * Fetch the mapped token list for a chain.
   *
   * @param chainId - Chain ID in hex format.
   * @returns Token list entries, including fields the address list drops.
   */
  async getTokenList(chainId: ChainId): Promise<TokenListEntry[]> {
    return this.#fetchAndCacheTokenList(chainId);
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

  /**
   * Load the ERC-20 list for a chain from `@metamask/core-backend`
   * `TokenApiClient`:
   * - `GET /v2/supportedNetworks`
   * - `GET /v1/suggestedOccurrenceFloors`
   * - `GET /tokens/{chainId}`
   *
   * Returns `[]` when the chain is unsupported or a request fails. Linea
   * mainnet keeps entries flagged by `lineaTeam` or seen by at least 3
   * aggregators.
   *
   * @param hexChainId - Chain ID in hex format (for example `'0x1'`).
   * @returns Token list entries, or an empty array.
   */
  async #fetchTokenList(hexChainId: ChainId): Promise<TokenListEntry[]> {
    if (!(await this.#isSupportedChain(hexChainId))) {
      return [];
    }

    return this.#fetchTokenListEntries(hexChainId);
  }

  async #isSupportedChain(hexChainId: ChainId): Promise<boolean> {
    try {
      const data = await this.#tokenApi.fetchV2SupportedNetworks({
        staleTime: SUPPORTED_NETWORKS_CACHE_TTL_MS,
        gcTime: SUPPORTED_NETWORKS_CACHE_TTL_MS,
        retry: false,
      });
      const caipChainId = `eip155:${convertHexToDecimal(hexChainId)}`;
      const supported = new Set([
        ...(data.fullSupport ?? []),
        ...(data.partialSupport ?? []),
      ]);
      return supported.has(caipChainId);
    } catch {
      return false;
    }
  }

  async #getOccurrenceFloor(hexChainId: ChainId): Promise<number> {
    try {
      const data = await this.#tokenApi.fetchV1SuggestedOccurrenceFloors({
        staleTime: SUGGESTED_OCCURRENCE_FLOORS_CACHE_TTL_MS,
        gcTime: SUGGESTED_OCCURRENCE_FLOORS_CACHE_TTL_MS,
        retry: false,
      });
      if (data && typeof data === 'object' && !Array.isArray(data)) {
        const decimalChainId = String(convertHexToDecimal(hexChainId));
        return data[decimalChainId] ?? DEFAULT_OCCURRENCE_FLOOR;
      }
    } catch {
      // Fall through to the default floor.
    }
    return DEFAULT_OCCURRENCE_FLOOR;
  }

  async #fetchTokenListEntries(hexChainId: ChainId): Promise<TokenListEntry[]> {
    const decimalChainId = convertHexToDecimal(hexChainId);
    const occurrenceFloor = await this.#getOccurrenceFloor(hexChainId);

    try {
      const raw = await this.#tokenApi.fetchTokenList(
        decimalChainId,
        {
          occurrenceFloor,
          includeNativeAssets: false,
          includeTokenFees: false,
          includeAssetType: false,
          includeERC20Permit: false,
          includeStorage: false,
          includeRwaData: true,
        },
        {
          staleTime: this.#cacheTokenList ? TOKEN_LIST_STALE_TIME_MS : 0,
          gcTime: this.#cacheTokenList ? TOKEN_LIST_GC_TIME_MS : 0,
          retry: false,
        },
      );
      const items: ApiTokenListItem[] = Array.isArray(raw) ? raw : [];
      return this.#applyChainSpecificFilters(hexChainId, items).map((item) => ({
        address: item.address,
        symbol: item.symbol ?? '',
        name: item.name ?? '',
        decimals: item.decimals ?? 18,
        iconUrl: item.iconUrl,
        aggregators: item.aggregators,
        occurrences: item.occurrences,
      }));
    } catch (error) {
      console.error(
        `Tokens API request failed for chain ${hexChainId}:`,
        error,
      );
      return [];
    }
  }

  /**
   * Apply chain-specific filters, mirroring `fetchTokenListByChainId` in
   * `assets-controllers/src/token-service.ts`.
   *
   * @param hexChainId - Hex chain ID.
   * @param items - Raw items from the API response.
   * @returns Items after chain-specific filtering.
   */
  #applyChainSpecificFilters(
    hexChainId: ChainId,
    items: ApiTokenListItem[],
  ): ApiTokenListItem[] {
    if (hexChainId === ControllerChainId['linea-mainnet']) {
      return items.filter((item) => {
        const aggregators = item.aggregators ?? [];
        return aggregators.includes('lineaTeam') || aggregators.length >= 3;
      });
    }
    return items;
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
