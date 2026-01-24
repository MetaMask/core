import type {
  ControllerGetStateAction,
  ControllerStateChangeEvent,
  StateMetadata,
} from '@metamask/base-controller';
import { toChecksumHexAddress } from '@metamask/controller-utils';
import type { Messenger } from '@metamask/messenger';
import type {
  NetworkControllerGetStateAction,
  NetworkControllerStateChangeEvent,
} from '@metamask/network-controller';
import type { NetworkEnablementControllerGetStateAction } from '@metamask/network-enablement-controller';
import { StaticIntervalPollingController } from '@metamask/polling-controller';
import type { Hex } from '@metamask/utils';
import { isEqual } from 'lodash';

import { reduceInBatchesSerially, TOKEN_PRICES_BATCH_SIZE } from './assetsUtil';
import type { AbstractTokenPricesService } from './token-prices-service/abstract-token-prices-service';
import { getNativeTokenAddress } from './token-prices-service/codefi-v2';
import { TokenRwaData } from './token-service';
import type {
  TokensControllerGetStateAction,
  TokensControllerStateChangeEvent,
  TokensControllerState,
} from './TokensController';

/**
 * @type Token
 *
 * Token representation
 *
 * @property address - Hex address of the token contract
 * @property decimals - Number of decimals the token uses
 * @property symbol - Symbol of the token
 * @property aggregators - An array containing the token's aggregators
 * @property image - Image of the token, url or bit32 image
 * @property hasBalanceError - 'true' if there is an error while updating the token balance
 * @property isERC721 - 'true' if the token is a ERC721 token
 * @property name - Name of the token
 */
export type Token = {
  address: string;
  decimals: number;
  symbol: string;
  aggregators?: string[];
  image?: string;
  hasBalanceError?: boolean;
  isERC721?: boolean;
  name?: string;
  rwaData?: TokenRwaData;
};

const DEFAULT_INTERVAL = 180000;

export type ContractExchangeRates = {
  [address: string]: number | undefined;
};

export type MarketDataDetails = {
  tokenAddress: `0x${string}`;
  currency: string;
  allTimeHigh: number;
  allTimeLow: number;
  circulatingSupply: number;
  dilutedMarketCap: number;
  high1d: number;
  low1d: number;
  marketCap: number;
  marketCapPercentChange1d: number;
  price: number;
  priceChange1d: number;
  pricePercentChange1d: number;
  pricePercentChange1h: number;
  pricePercentChange1y: number;
  pricePercentChange7d: number;
  pricePercentChange14d: number;
  pricePercentChange30d: number;
  pricePercentChange200d: number;
  totalVolume: number;
};

/**
 * Represents a mapping of token contract addresses to their market data.
 */
export type ContractMarketData = Record<Hex, MarketDataDetails>;

type ChainIdAndNativeCurrency = {
  chainId: Hex;
  nativeCurrency: string;
};

/**
 * The external actions available to the {@link TokenRatesController}.
 */
export type AllowedActions =
  | TokensControllerGetStateAction
  | NetworkControllerGetStateAction
  | NetworkEnablementControllerGetStateAction;

/**
 * The external events available to the {@link TokenRatesController}.
 */
export type AllowedEvents =
  | TokensControllerStateChangeEvent
  | NetworkControllerStateChangeEvent;

/**
 * The name of the {@link TokenRatesController}.
 */
export const controllerName = 'TokenRatesController';

/**
 * @type TokenRatesState
 *
 * Token rates controller state
 *
 * @property marketData - Market data for tokens, keyed by chain ID and then token contract address.
 */
export type TokenRatesControllerState = {
  marketData: Record<Hex, Record<Hex, MarketDataDetails>>;
};

/**
 * The action that can be performed to get the state of the {@link TokenRatesController}.
 */
export type TokenRatesControllerGetStateAction = ControllerGetStateAction<
  typeof controllerName,
  TokenRatesControllerState
>;

/**
 * The actions that can be performed using the {@link TokenRatesController}.
 */
export type TokenRatesControllerActions = TokenRatesControllerGetStateAction;

/**
 * The event that {@link TokenRatesController} can emit.
 */
export type TokenRatesControllerStateChangeEvent = ControllerStateChangeEvent<
  typeof controllerName,
  TokenRatesControllerState
>;

/**
 * The events that {@link TokenRatesController} can emit.
 */
export type TokenRatesControllerEvents = TokenRatesControllerStateChangeEvent;

/**
 * The messenger of the {@link TokenRatesController} for communication.
 */
export type TokenRatesControllerMessenger = Messenger<
  typeof controllerName,
  TokenRatesControllerActions | AllowedActions,
  TokenRatesControllerEvents | AllowedEvents
>;

const tokenRatesControllerMetadata: StateMetadata<TokenRatesControllerState> = {
  marketData: {
    includeInStateLogs: false,
    persist: true,
    includeInDebugSnapshot: false,
    usedInUi: true,
  },
};

/**
 * Get the default {@link TokenRatesController} state.
 *
 * @returns The default {@link TokenRatesController} state.
 */
export const getDefaultTokenRatesControllerState =
  (): TokenRatesControllerState => {
    return {
      marketData: {},
    };
  };

/** The input to start polling for the {@link TokenRatesController} */
export type TokenRatesPollingInput = {
  chainIds: Hex[];
};

/**
 * Controller that passively polls on a set interval for token-to-fiat exchange rates
 * for tokens stored in the TokensController
 */
export class TokenRatesController extends StaticIntervalPollingController<TokenRatesPollingInput>()<
  typeof controllerName,
  TokenRatesControllerState,
  TokenRatesControllerMessenger
> {
  readonly #tokenPricesService: AbstractTokenPricesService;

  #disabled: boolean;

  #allTokens: TokensControllerState['allTokens'];

  #allDetectedTokens: TokensControllerState['allDetectedTokens'];

  /**
   * Creates a TokenRatesController instance.
   *
   * @param options - The controller options.
   * @param options.interval - The polling interval in ms
   * @param options.disabled - Boolean to track if network requests are blocked
   * @param options.tokenPricesService - An object in charge of retrieving token price
   * @param options.messenger - The messenger instance for communication
   * @param options.state - Initial state to set on this controller
   */
  constructor({
    interval = DEFAULT_INTERVAL,
    disabled = false,
    tokenPricesService,
    messenger,
    state,
  }: {
    interval?: number;
    disabled?: boolean;
    tokenPricesService: AbstractTokenPricesService;
    messenger: TokenRatesControllerMessenger;
    state?: Partial<TokenRatesControllerState>;
  }) {
    super({
      name: controllerName,
      messenger,
      state: { ...getDefaultTokenRatesControllerState(), ...state },
      metadata: tokenRatesControllerMetadata,
    });

    this.setIntervalLength(interval);
    this.#tokenPricesService = tokenPricesService;
    this.#disabled = disabled;

    const { allTokens, allDetectedTokens } = this.#getTokensControllerState();
    this.#allTokens = allTokens;
    this.#allDetectedTokens = allDetectedTokens;

    // Set native asset identifiers from NetworkEnablementController for CAIP-19 native token lookups
    this.#initNativeAssetIdentifiers();

    this.#subscribeToTokensStateChange();

    this.#subscribeToNetworkStateChange();
  }

  #subscribeToTokensStateChange() {
    this.messenger.subscribe(
      'TokensController:stateChange',
      // TODO: Either fix this lint violation or explain why it's necessary to ignore.
      // eslint-disable-next-line @typescript-eslint/no-misused-promises
      async ({ allTokens, allDetectedTokens }) => {
        if (this.#disabled) {
          return;
        }

        const { networkConfigurationsByChainId } = this.messenger.call(
          'NetworkController:getState',
        );

        const chainIds = [
          ...new Set([
            ...Object.keys(allTokens),
            ...Object.keys(allDetectedTokens),
          ]),
        ] as Hex[];

        const chainIdsToUpdate = chainIds.filter(
          (chainId) =>
            !isEqual(this.#allTokens[chainId], allTokens[chainId]) ||
            !isEqual(
              this.#allDetectedTokens[chainId],
              allDetectedTokens[chainId],
            ),
        );

        this.#allTokens = allTokens;
        this.#allDetectedTokens = allDetectedTokens;

        const chainIdAndNativeCurrency = chainIdsToUpdate.reduce<
          { chainId: Hex; nativeCurrency: string }[]
        >((acc, chainId) => {
          const networkConfiguration = networkConfigurationsByChainId[chainId];
          if (!networkConfiguration) {
            console.error(
              `TokenRatesController: No network configuration found for chainId ${chainId}`,
            );
            return acc;
          }
          acc.push({
            chainId,
            nativeCurrency: networkConfiguration.nativeCurrency,
          });
          return acc;
        }, []);

        await this.updateExchangeRates(chainIdAndNativeCurrency);
      },
      ({ allTokens, allDetectedTokens }) => {
        return { allTokens, allDetectedTokens };
      },
    );
  }

  #subscribeToNetworkStateChange() {
    this.messenger.subscribe(
      'NetworkController:stateChange',
      (_state, patches) => {
        // Remove state for deleted networks
        for (const patch of patches) {
          if (
            patch.op === 'remove' &&
            patch.path[0] === 'networkConfigurationsByChainId'
          ) {
            const removedChainId = patch.path[1] as Hex;
            this.update((state) => {
              delete state.marketData[removedChainId];
            });
          }
        }
      },
    );
  }

  /**
   * Initialize the native asset identifiers from NetworkEnablementController.
   * This provides CAIP-19 native asset IDs for the token prices service.
   */
  #initNativeAssetIdentifiers(): void {
    if (this.#tokenPricesService.setNativeAssetIdentifiers) {
      const { nativeAssetIdentifiers } = this.messenger.call(
        'NetworkEnablementController:getState',
      );
      this.#tokenPricesService.setNativeAssetIdentifiers(
        nativeAssetIdentifiers,
      );
    }
  }

  /**
   * Get the tokens for the given chain.
   *
   * @param chainId - The chain ID.
   * @returns The list of tokens addresses for the current chain
   */
  #getTokenAddresses(chainId: Hex): Hex[] {
    const getTokens = (allTokens: Record<Hex, { address: string }[]>) =>
      Object.values(allTokens ?? {}).flatMap((tokens) =>
        tokens.map(({ address }) => toChecksumHexAddress(address) as Hex),
      );

    const tokenAddresses = getTokens(this.#allTokens[chainId]);
    const detectedTokenAddresses = getTokens(this.#allDetectedTokens[chainId]);

    return [
      ...new Set([
        ...tokenAddresses,
        ...detectedTokenAddresses,
        getNativeTokenAddress(chainId),
      ]),
    ].sort();
  }

  /**
   * Allows controller to make active and passive polling requests
   */
  enable(): void {
    this.#disabled = false;
  }

  /**
   * Blocks controller from making network calls
   */
  disable(): void {
    this.#disabled = true;
  }

  #getTokensControllerState(): {
    allTokens: TokensControllerState['allTokens'];
    allDetectedTokens: TokensControllerState['allDetectedTokens'];
  } {
    const { allTokens, allDetectedTokens } = this.messenger.call(
      'TokensController:getState',
    );

    return {
      allTokens,
      allDetectedTokens,
    };
  }

  /**
   * Updates exchange rates for all tokens.
   *
   * @param chainIdAndNativeCurrency - The chain ID and native currency.
   */
  async updateExchangeRates(
    chainIdAndNativeCurrency: ChainIdAndNativeCurrency[],
  ): Promise<void> {
    if (this.#disabled) {
      return;
    }

    const marketData: Record<Hex, Record<Hex, MarketDataDetails>> = {};
    const assetsByNativeCurrency: Record<
      string,
      {
        chainId: Hex;
        tokenAddress: Hex;
      }[]
    > = {};
    const unsupportedAssetsByNativeCurrency: Record<
      string,
      {
        chainId: Hex;
        tokenAddress: Hex;
      }[]
    > = {};
    for (const { chainId, nativeCurrency } of chainIdAndNativeCurrency) {
      if (this.#tokenPricesService.validateChainIdSupported(chainId)) {
        for (const tokenAddress of this.#getTokenAddresses(chainId)) {
          if (
            this.#tokenPricesService.validateCurrencySupported(nativeCurrency)
          ) {
            (assetsByNativeCurrency[nativeCurrency] ??= []).push({
              chainId,
              tokenAddress,
            });
          } else {
            (unsupportedAssetsByNativeCurrency[nativeCurrency] ??= []).push({
              chainId,
              tokenAddress,
            });
          }
        }
      }
    }

    const promises = [
      ...Object.entries(assetsByNativeCurrency).map(
        ([nativeCurrency, assets]) =>
          this.#fetchAndMapExchangeRatesForSupportedNativeCurrency(
            assets,
            nativeCurrency,
            marketData,
          ),
      ),
      ...Object.entries(unsupportedAssetsByNativeCurrency).map(
        ([nativeCurrency, assets]) =>
          this.#fetchAndMapExchangeRatesForUnsupportedNativeCurrency(
            assets,
            nativeCurrency,
            marketData,
          ),
      ),
    ];

    await Promise.allSettled(promises);

    const chainIds = new Set(
      Object.values(chainIdAndNativeCurrency).map((chain) => chain.chainId),
    );

    for (const chainId of chainIds) {
      if (!marketData[chainId]) {
        marketData[chainId] = {};
      }
    }

    if (Object.keys(marketData).length > 0) {
      this.update((state) => {
        state.marketData = {
          ...state.marketData,
          ...marketData,
        };
      });
    }
  }

  async #fetchAndMapExchangeRatesForSupportedNativeCurrency(
    assets: {
      chainId: Hex;
      tokenAddress: Hex;
    }[],
    currency: string,
    marketData: Record<Hex, Record<Hex, MarketDataDetails>> = {},
  ) {
    return await reduceInBatchesSerially<
      { chainId: Hex; tokenAddress: Hex },
      Record<Hex, Record<Hex, MarketDataDetails>>
    >({
      values: assets,
      batchSize: TOKEN_PRICES_BATCH_SIZE,
      eachBatch: async (partialMarketData, assetsBatch) => {
        const batchMarketData = await this.#tokenPricesService.fetchTokenPrices(
          {
            assets: assetsBatch,
            currency,
          },
        );

        for (const tokenPrice of batchMarketData) {
          (partialMarketData[tokenPrice.chainId] ??= {})[
            tokenPrice.tokenAddress
          ] = tokenPrice;
        }

        return partialMarketData;
      },
      initialResult: marketData,
    });
  }

  async #fetchAndMapExchangeRatesForUnsupportedNativeCurrency(
    assets: {
      chainId: Hex;
      tokenAddress: Hex;
    }[],
    currency: string,
    marketData: Record<Hex, Record<Hex, MarketDataDetails>>,
  ) {
    // Step -1: Then fetch all tracked tokens priced in USD
    const marketDataInUSD =
      await this.#fetchAndMapExchangeRatesForSupportedNativeCurrency(
        assets,
        'usd', // Fallback currency when the native currency is not supported
      );

    // Formula: price_in_native = token_usd / native_usd
    const convertUSDToNative = (
      valueInUSD: number,
      nativeTokenPriceInUSD: number,
    ) => valueInUSD / nativeTokenPriceInUSD;

    // Step -2: Convert USD prices to native currency
    for (const [chainId, marketDataByTokenAddress] of Object.entries(
      marketDataInUSD,
    ) as [Hex, Record<Hex, MarketDataDetails>][]) {
      const nativeTokenPriceInUSD =
        marketDataByTokenAddress[getNativeTokenAddress(chainId)]?.price;

      // Return here if it's null, undefined or 0
      if (!nativeTokenPriceInUSD) {
        continue;
      }

      for (const [tokenAddress, tokenData] of Object.entries(
        marketDataByTokenAddress,
      ) as [Hex, MarketDataDetails][]) {
        (marketData[chainId] ??= {})[tokenAddress] = {
          ...tokenData,
          currency,
          price: convertUSDToNative(tokenData.price, nativeTokenPriceInUSD),
          marketCap: convertUSDToNative(
            tokenData.marketCap,
            nativeTokenPriceInUSD,
          ),
          allTimeHigh: convertUSDToNative(
            tokenData.allTimeHigh,
            nativeTokenPriceInUSD,
          ),
          allTimeLow: convertUSDToNative(
            tokenData.allTimeLow,
            nativeTokenPriceInUSD,
          ),
          totalVolume: convertUSDToNative(
            tokenData.totalVolume,
            nativeTokenPriceInUSD,
          ),
          high1d: convertUSDToNative(tokenData.high1d, nativeTokenPriceInUSD),
          low1d: convertUSDToNative(tokenData.low1d, nativeTokenPriceInUSD),
          dilutedMarketCap: convertUSDToNative(
            tokenData.dilutedMarketCap,
            nativeTokenPriceInUSD,
          ),
        };
      }
    }
  }

  /**
   * Updates token rates for the given networkClientId
   *
   * @param input - The input for the poll.
   * @param input.chainIds - The chain ids to poll token rates on.
   */
  async _executePoll({ chainIds }: TokenRatesPollingInput): Promise<void> {
    const { networkConfigurationsByChainId } = this.messenger.call(
      'NetworkController:getState',
    );

    const chainIdAndNativeCurrency = chainIds.reduce<
      { chainId: Hex; nativeCurrency: string }[]
    >((acc, chainId) => {
      const networkConfiguration = networkConfigurationsByChainId[chainId];
      if (!networkConfiguration) {
        console.error(
          `TokenRatesController: No network configuration found for chainId ${chainId}`,
        );
        return acc;
      }
      acc.push({
        chainId,
        nativeCurrency: networkConfiguration.nativeCurrency,
      });
      return acc;
    }, []);

    await this.updateExchangeRates(chainIdAndNativeCurrency);
  }

  /**
   * Reset the controller state to the default state.
   */
  resetState() {
    this.update(() => {
      return getDefaultTokenRatesControllerState();
    });
  }
}

export default TokenRatesController;
