import type {
  AccountsControllerGetAccountAction,
  AccountsControllerGetSelectedAccountAction,
  AccountsControllerSelectedEvmAccountChangeEvent,
} from '@metamask/accounts-controller';
import type {
  ControllerGetStateAction,
  ControllerStateChangeEvent,
  StateMetadata,
} from '@metamask/base-controller';
import {
  safelyExecute,
  toChecksumHexAddress,
  FALL_BACK_VS_CURRENCY,
} from '@metamask/controller-utils';
import type { Messenger } from '@metamask/messenger';
import type {
  NetworkControllerGetNetworkClientByIdAction,
  NetworkControllerGetStateAction,
  NetworkControllerStateChangeEvent,
} from '@metamask/network-controller';
import { StaticIntervalPollingController } from '@metamask/polling-controller';
import type { Hex } from '@metamask/utils';
import { isEqual } from 'lodash';

import { reduceInBatchesSerially, TOKEN_PRICES_BATCH_SIZE } from './assetsUtil';
import { fetchExchangeRate as fetchNativeCurrencyExchangeRate } from './crypto-compare-service';
import type { AbstractTokenPricesService } from './token-prices-service/abstract-token-prices-service';
import { getNativeTokenAddress } from './token-prices-service/codefi-v2';
import type { SupportedCurrency } from './token-prices-service/codefi-v2';
import type {
  TokensControllerGetStateAction,
  TokensControllerStateChangeEvent,
  TokensControllerState,
} from './TokensController';

/**
 * @type Token
 *
 * Token representation
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

enum PollState {
  Active = 'Active',
  Inactive = 'Inactive',
}

/**
 * The external actions available to the {@link TokenRatesController}.
 */
export type AllowedActions =
  | TokensControllerGetStateAction
  | NetworkControllerGetNetworkClientByIdAction
  | NetworkControllerGetStateAction
  | AccountsControllerGetAccountAction
  | AccountsControllerGetSelectedAccountAction;

/**
 * The external events available to the {@link TokenRatesController}.
 */
export type AllowedEvents =
  | TokensControllerStateChangeEvent
  | NetworkControllerStateChangeEvent
  | AccountsControllerSelectedEvmAccountChangeEvent;

/**
 * The name of the {@link TokenRatesController}.
 */
export const controllerName = 'TokenRatesController';

/**
 * @type TokenRatesState
 *
 * Token rates controller state
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

/**
 * Uses the CryptoCompare API to fetch the exchange rate between one currency
 * and another, i.e., the multiplier to apply the amount of one currency in
 * order to convert it to another.
 *
 * @param args - The arguments to this function.
 * @param args.from - The currency to convert from.
 * @param args.to - The currency to convert to.
 * @returns The exchange rate between `fromCurrency` to `toCurrency` if one
 * exists, or null if one does not.
 */
async function getCurrencyConversionRate({
  from,
  to,
}: {
  from: string;
  to: string;
}) {
  const includeUSDRate = false;
  try {
    const result = await fetchNativeCurrencyExchangeRate(
      to,
      from,
      includeUSDRate,
    );
    return result.conversionRate;
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.includes('market does not exist for this coin pair')
    ) {
      return null;
    }
    throw error;
  }
}

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
  #handle?: ReturnType<typeof setTimeout>;

  #pollState = PollState.Inactive;

  readonly #tokenPricesService: AbstractTokenPricesService;


  #disabled: boolean;

  #interval: number;

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
    this.#interval = interval;

    const { allTokens, allDetectedTokens } = this.#getTokensControllerState();
    this.#allTokens = allTokens;
    this.#allDetectedTokens = allDetectedTokens;

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

        await this.updateExchangeRatesByChainId(chainIdAndNativeCurrency);
      },
      ({ allTokens, allDetectedTokens }) => {
        return { allTokens, allDetectedTokens };
      },
    );
  }

  #subscribeToNetworkStateChange() {
    this.messenger.subscribe(
      'NetworkController:stateChange',
      // TODO: Either fix this lint violation or explain why it's necessary to ignore.
      // eslint-disable-next-line @typescript-eslint/no-misused-promises
      async ({ networkConfigurationsByChainId }, patches) => {
        const chainIdAndNativeCurrency: {
          chainId: Hex;
          nativeCurrency: string;
        }[] = Object.values(networkConfigurationsByChainId).map(
          ({ chainId, nativeCurrency }) => {
            return {
              chainId: chainId as Hex,
              nativeCurrency,
            };
          },
        );

        if (this.#pollState === PollState.Active) {
          await this.updateExchangeRates(chainIdAndNativeCurrency);
        }

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

    return [...new Set([...tokenAddresses, ...detectedTokenAddresses])].sort();
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

  /**
   * Start (or restart) polling.
   *
   * @param chainId - The chain ID.
   * @param nativeCurrency - The native currency.
   */
  async start(chainId: Hex, nativeCurrency: string) {
    this.#stopPoll();
    this.#pollState = PollState.Active;
    await this.#poll(chainId, nativeCurrency);
  }

  /**
   * Stop polling.
   */
  stop() {
    this.#stopPoll();
    this.#pollState = PollState.Inactive;
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
   * Clear the active polling timer, if present.
   */
  #stopPoll() {
    if (this.#handle) {
      clearTimeout(this.#handle);
    }
  }

  /**
   * Poll for exchange rate updates.
   *
   * @param chainId - The chain ID.
   * @param nativeCurrency - The native currency.
   */
  async #poll(chainId: Hex, nativeCurrency: string) {
    await safelyExecute(() =>
      this.updateExchangeRates([{ chainId, nativeCurrency }]),
    );

    // Poll using recursive `setTimeout` instead of `setInterval` so that
    // requests don't stack if they take longer than the polling interval
    this.#handle = setTimeout(() => {
      // TODO: Either fix this lint violation or explain why it's necessary to ignore.
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      this.#poll(chainId, nativeCurrency);
    }, this.#interval);
  }

  /**
   * Updates exchange rates for all tokens.
   *
   * @param chainIdAndNativeCurrency - The chain ID and native currency.
   */
  async updateExchangeRates(
    chainIdAndNativeCurrency: {
      chainId: Hex;
      nativeCurrency: string;
    }[],
  ) {
    await this.updateExchangeRatesByChainId(chainIdAndNativeCurrency);
  }

  /**
   * Updates exchange rates for all tokens.
   *
   * @param chainIds - The chain IDs.
   * @returns A promise that resolves when all chain updates complete.
   */
  /**
   * Updates exchange rates for all tokens.
   *
   * @param chainIdAndNativeCurrency - The chain ID and native currency.
   */
  async updateExchangeRatesByChainId(
    chainIdAndNativeCurrency: {
      chainId: Hex;
      nativeCurrency: string;
    }[],
  ): Promise<void> {
    if (this.#disabled) {
      return;
    }

    // Use multichain approach only - no fallback
    const chainAndTokenRequests = chainIdAndNativeCurrency.map(
      ({ chainId, nativeCurrency }) => ({
        chainId,
        tokenAddresses: this.#getTokenAddresses(chainId),
        nativeCurrency,
      }),
    );

    const multichainResults = await this.#fetchMultichainExchangeRates({
      chainAndTokenRequests,
    });

    // Update with multichain results
    if (Object.keys(multichainResults).length > 0) {
      this.update((state) => {
        for (const [chainId, contractExchangeRates] of Object.entries(
          multichainResults,
        )) {
          const chainIdHex = chainId as Hex;
          if (!state.marketData[chainIdHex]) {
            state.marketData[chainIdHex] = {};
          }
          state.marketData[chainIdHex] = {
            ...state.marketData[chainIdHex],
            ...contractExchangeRates,
          };
        }
      });
    }
  }

  /**
   * Uses the multichain token prices service to retrieve exchange rates for tokens
   * across multiple chains in a single request. This is more efficient than making
   * multiple single-chain requests.
   *
   * @param args - The arguments to this function.
   * @param args.chainAndTokenRequests - Array of objects containing chainId, tokenAddresses, and nativeCurrency.
   * @returns A map from chain ID to token addresses to their prices.
   */
  async #fetchMultichainExchangeRates({
    chainAndTokenRequests,
  }: {
    chainAndTokenRequests: {
      chainId: Hex;
      tokenAddresses: Hex[];
      nativeCurrency: string;
    }[];
  }): Promise<Record<Hex, ContractMarketData>> {
    // fetchMultichainTokenPrices is now required, no need to check

    // Helper function to parse CAIP asset IDs back to chain ID and token address
    const parseCaipAssetId = (caipAssetId: string): { chainId: Hex; tokenAddress: Hex } | null => {
      try {
        // Handle SLIP44 format: eip155:1/slip44:60
        if (caipAssetId.includes('/slip44:')) {
          const [namespaceChain, slip44Part] = caipAssetId.split('/slip44:');
          const [namespace, chainIdStr] = namespaceChain.split(':');
          if (namespace === 'eip155' && chainIdStr) {
            const chainId = `0x${parseInt(chainIdStr, 10).toString(16)}` as Hex;
            const nativeTokenAddress = getNativeTokenAddress(chainId);
            return { chainId, tokenAddress: nativeTokenAddress };
          }
        } else {
          // Handle regular format: eip155:1:0x...
          const [namespace, chainIdStr, tokenAddress] = caipAssetId.split(':');
          if (namespace === 'eip155' && chainIdStr && tokenAddress) {
            const chainId = `0x${parseInt(chainIdStr, 10).toString(16)}` as Hex;
            return { chainId, tokenAddress: tokenAddress as Hex };
          }
        }
      } catch (error) {
        console.error(`Failed to parse CAIP asset ID: ${caipAssetId}`, error);
      }
      return null;
    };

    // Group requests by currency to batch them efficiently
    const requestsByCurrency: Record<
      string,
      { chainId: Hex; tokenAddresses: Hex[] }[]
    > = {};
    const chainToCurrency: Record<Hex, string> = {};

    for (const request of chainAndTokenRequests) {
      const { chainId, tokenAddresses, nativeCurrency } = request;
      chainToCurrency[chainId] = nativeCurrency;

      if (!requestsByCurrency[nativeCurrency]) {
        requestsByCurrency[nativeCurrency] = [];
      }
      requestsByCurrency[nativeCurrency].push({ chainId, tokenAddresses });
    }

    const results: Record<Hex, ContractMarketData> = {};

    // Process each currency group
    for (const [currency, requests] of Object.entries(requestsByCurrency)) {
      try {
        const caipPrices = await this.#tokenPricesService.fetchMultichainTokenPrices({
          tokenRequests: requests,
          currency: currency as SupportedCurrency,
        });

        // Convert CAIP results back to chain-based structure
        for (const request of requests) {
          const { chainId } = request;
          results[chainId] = {};
        }

        // Map CAIP asset IDs back to chain + token structure
        for (const [caipAssetId, tokenPrice] of Object.entries(caipPrices)) {
          const parsedAsset = parseCaipAssetId(caipAssetId);
          if (parsedAsset) {
            const { chainId, tokenAddress } = parsedAsset;
            if (results[chainId]) {
              results[chainId][tokenAddress] = tokenPrice;
            }
          }
        }
      } catch (error) {
        console.error(
          `Failed to fetch multichain prices for currency ${currency}:`,
          error,
        );
        throw error;
      }
    }

    return results;
  }

  /**
   * Uses the token prices service to retrieve exchange rates for tokens in a
   * particular currency.
   *
   * If the price API does not support the given chain ID, returns an empty
   * object.
   *
   * If the price API does not support the given currency, retrieves exchange
   * rates in a known currency instead, then converts those rates using the
   * exchange rate between the known currency and desired currency.
   *
   * @param args - The arguments to this function.
   * @param args.tokenAddresses - Addresses for tokens.
   * @param args.chainId - The EIP-155 ID of the chain where the tokens live.
   * @param args.nativeCurrency - The native currency in which to request
   * exchange rates.
   * @returns A map from token address to its exchange rate in the native
   * currency, or an empty map if no exchange rates can be obtained for the
   * chain ID.
   */
  async #fetchAndMapExchangeRates({
    tokenAddresses,
    chainId,
    nativeCurrency,
  }: {
    tokenAddresses: Hex[];
    chainId: Hex;
    nativeCurrency: string;
  }): Promise<ContractMarketData> {
    if (!this.#tokenPricesService.validateChainIdSupported(chainId)) {
      return tokenAddresses.reduce((obj, tokenAddress) => {
        obj = {
          ...obj,
          [tokenAddress]: undefined,
        };

        return obj;
      }, {});
    }

    if (this.#tokenPricesService.validateCurrencySupported(nativeCurrency)) {
      return await this.#fetchAndMapExchangeRatesForSupportedNativeCurrency({
        tokenAddresses,
        chainId,
        nativeCurrency,
      });
    }

    return await this.#fetchAndMapExchangeRatesForUnsupportedNativeCurrency({
      chainId,
      tokenAddresses,
      nativeCurrency,
    });
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

    await this.updateExchangeRatesByChainId(chainIdAndNativeCurrency);
  }

  /**
   * Retrieves prices in the given currency for the given tokens on the given
   * chain. Ensures that token addresses are checksum addresses.
   *
   * @param args - The arguments to this function.
   * @param args.tokenAddresses - Addresses for tokens.
   * @param args.chainId - The EIP-155 ID of the chain where the tokens live.
   * @param args.nativeCurrency - The native currency in which to request
   * prices.
   * @returns A map of the token addresses (as checksums) to their prices in the
   * native currency.
   */
  async #fetchAndMapExchangeRatesForSupportedNativeCurrency({
    tokenAddresses,
    chainId,
    nativeCurrency,
  }: {
    tokenAddresses: Hex[];
    chainId: Hex;
    nativeCurrency: string;
  }): Promise<ContractMarketData> {
    let contractNativeInformations;
    const tokenPricesByTokenAddress = await reduceInBatchesSerially<
      Hex,
      Awaited<ReturnType<AbstractTokenPricesService['fetchTokenPrices']>>
    >({
      values: [...tokenAddresses].sort(),
      batchSize: TOKEN_PRICES_BATCH_SIZE,
      eachBatch: async (allTokenPricesByTokenAddress, batch) => {
        const tokenPricesByTokenAddressForBatch =
          await this.#tokenPricesService.fetchTokenPrices({
            tokenAddresses: batch,
            chainId,
            currency: nativeCurrency,
          });

        return {
          ...allTokenPricesByTokenAddress,
          ...tokenPricesByTokenAddressForBatch,
        };
      },
      initialResult: {},
    });
    contractNativeInformations = tokenPricesByTokenAddress;

    // fetch for native token
    if (tokenAddresses.length === 0) {
      const contractNativeInformationsNative =
        await this.#tokenPricesService.fetchTokenPrices({
          tokenAddresses: [],
          chainId,
          currency: nativeCurrency,
        });

      contractNativeInformations = {
        [getNativeTokenAddress(chainId)]: {
          currency: nativeCurrency,
          ...contractNativeInformationsNative[getNativeTokenAddress(chainId)],
        },
      };
    }
    return Object.entries(contractNativeInformations).reduce(
      (obj, [tokenAddress, token]) => {
        obj = {
          ...obj,
          [tokenAddress]: { ...token },
        };

        return obj;
      },
      {},
    );
  }

  /**
   * If the price API does not support a given native currency, then we need to
   * convert it to a fallback currency and feed that currency into the price
   * API, then convert the prices to our desired native currency.
   *
   * @param args - The arguments to this function.
   * @param args.chainId - The chain id to fetch prices for.
   * @param args.tokenAddresses - Addresses for tokens.
   * @param args.nativeCurrency - The native currency in which to request
   * prices.
   * @returns A map of the token addresses (as checksums) to their prices in the
   * native currency.
   */
  async #fetchAndMapExchangeRatesForUnsupportedNativeCurrency({
    chainId,
    tokenAddresses,
    nativeCurrency,
  }: {
    chainId: Hex;
    tokenAddresses: Hex[];
    nativeCurrency: string;
  }): Promise<ContractMarketData> {
    const [
      contractExchangeInformations,
      fallbackCurrencyToNativeCurrencyConversionRate,
    ] = await Promise.all([
      this.#fetchAndMapExchangeRatesForSupportedNativeCurrency({
        tokenAddresses,
        chainId,
        nativeCurrency: FALL_BACK_VS_CURRENCY,
      }),
      getCurrencyConversionRate({
        from: FALL_BACK_VS_CURRENCY,
        to: nativeCurrency,
      }),
    ]);

    if (fallbackCurrencyToNativeCurrencyConversionRate === null) {
      return {};
    }

    // Converts the price in the fallback currency to the native currency
    const convertFallbackToNative = (value: number | undefined) =>
      value !== undefined && value !== null
        ? value * fallbackCurrencyToNativeCurrencyConversionRate
        : undefined;

    const updatedContractExchangeRates = Object.entries(
      contractExchangeInformations,
    ).reduce((acc, [tokenAddress, token]) => {
      acc = {
        ...acc,
        [tokenAddress]: {
          ...token,
          currency: nativeCurrency,
          price: convertFallbackToNative(token.price),
          marketCap: convertFallbackToNative(token.marketCap),
          allTimeHigh: convertFallbackToNative(token.allTimeHigh),
          allTimeLow: convertFallbackToNative(token.allTimeLow),
          totalVolume: convertFallbackToNative(token.totalVolume),
          high1d: convertFallbackToNative(token.high1d),
          low1d: convertFallbackToNative(token.low1d),
          dilutedMarketCap: convertFallbackToNative(token.dilutedMarketCap),
        },
      };
      return acc;
    }, {});

    return updatedContractExchangeRates;
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
