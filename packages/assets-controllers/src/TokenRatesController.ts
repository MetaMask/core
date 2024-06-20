import type {
  AccountsControllerGetAccountAction,
  AccountsControllerGetSelectedAccountAction,
  AccountsControllerSelectedEvmAccountChangeEvent,
} from '@metamask/accounts-controller';
import type {
  ControllerGetStateAction,
  ControllerStateChangeEvent,
  RestrictedControllerMessenger,
} from '@metamask/base-controller';
import {
  safelyExecute,
  toChecksumHexAddress,
  FALL_BACK_VS_CURRENCY,
  toHex,
} from '@metamask/controller-utils';
import type { InternalAccount } from '@metamask/keyring-api';
import type {
  NetworkClientId,
  NetworkControllerGetNetworkClientByIdAction,
  NetworkControllerGetStateAction,
  NetworkControllerStateChangeEvent,
} from '@metamask/network-controller';
import { StaticIntervalPollingController } from '@metamask/polling-controller';
import { createDeferredPromise, type Hex } from '@metamask/utils';
import { isEqual } from 'lodash';

import { reduceInBatchesSerially, TOKEN_PRICES_BATCH_SIZE } from './assetsUtil';
import { fetchExchangeRate as fetchNativeCurrencyExchangeRate } from './crypto-compare-service';
import type { AbstractTokenPricesService } from './token-prices-service/abstract-token-prices-service';
import { ZERO_ADDRESS } from './token-prices-service/codefi-v2';
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

type MarketDataDetails = {
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
export type TokenRatesControllerMessenger = RestrictedControllerMessenger<
  typeof controllerName,
  TokenRatesControllerActions | AllowedActions,
  TokenRatesControllerEvents | AllowedEvents,
  AllowedActions['type'],
  AllowedEvents['type']
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

const tokenRatesControllerMetadata = {
  marketData: { persist: true, anonymous: false },
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

/**
 * Controller that passively polls on a set interval for token-to-fiat exchange rates
 * for tokens stored in the TokensController
 */
export class TokenRatesController extends StaticIntervalPollingController<
  typeof controllerName,
  TokenRatesControllerState,
  TokenRatesControllerMessenger
> {
  #handle?: ReturnType<typeof setTimeout>;

  #pollState = PollState.Inactive;

  #tokenPricesService: AbstractTokenPricesService;

  #inProcessExchangeRateUpdates: Record<`${Hex}:${string}`, Promise<void>> = {};

  #selectedAccountId: string;

  #disabled: boolean;

  #chainId: Hex;

  #ticker: string;

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
   * @param options.messenger - The controller messenger instance for communication
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

    const { chainId: currentChainId, ticker: currentTicker } =
      this.#getChainIdAndTicker();
    this.#chainId = currentChainId;
    this.#ticker = currentTicker;

    this.#selectedAccountId = this.#getSelectedAccount().id;

    const { allTokens, allDetectedTokens } = this.#getTokensControllerState();
    this.#allTokens = allTokens;
    this.#allDetectedTokens = allDetectedTokens;

    this.#subscribeToTokensStateChange();

    this.#subscribeToNetworkStateChange();

    this.#subscribeToAccountChange();
  }

  #subscribeToTokensStateChange() {
    this.messagingSystem.subscribe(
      'TokensController:stateChange',
      // TODO: Either fix this lint violation or explain why it's necessary to ignore.
      // eslint-disable-next-line @typescript-eslint/no-misused-promises
      async ({ allTokens, allDetectedTokens }) => {
        const previousTokenAddresses = this.#getTokenAddresses(this.#chainId);
        this.#allTokens = allTokens;
        this.#allDetectedTokens = allDetectedTokens;

        const newTokenAddresses = this.#getTokenAddresses(this.#chainId);
        if (
          !isEqual(previousTokenAddresses, newTokenAddresses) &&
          this.#pollState === PollState.Active
        ) {
          await this.updateExchangeRates();
        }
      },
      ({ allTokens, allDetectedTokens }) => {
        return { allTokens, allDetectedTokens };
      },
    );
  }

  #subscribeToNetworkStateChange() {
    this.messagingSystem.subscribe(
      'NetworkController:stateChange',
      // TODO: Either fix this lint violation or explain why it's necessary to ignore.
      // eslint-disable-next-line @typescript-eslint/no-misused-promises
      async ({ selectedNetworkClientId }) => {
        const {
          configuration: { chainId, ticker },
        } = this.messagingSystem.call(
          'NetworkController:getNetworkClientById',
          selectedNetworkClientId,
        );

        if (this.#chainId !== chainId || this.#ticker !== ticker) {
          this.update((state) => {
            state.marketData = {};
          });
          this.#chainId = chainId;
          this.#ticker = ticker;
          if (this.#pollState === PollState.Active) {
            await this.updateExchangeRates();
          }
        }
      },
    );
  }

  #subscribeToAccountChange() {
    this.messagingSystem.subscribe(
      'AccountsController:selectedEvmAccountChange',
      // TODO: Either fix this lint violation or explain why it's necessary to ignore.
      // eslint-disable-next-line @typescript-eslint/no-misused-promises
      async (selectedAccount) => {
        if (this.#selectedAccountId !== selectedAccount.id) {
          this.#selectedAccountId = selectedAccount.id;
          if (this.#pollState === PollState.Active) {
            await this.updateExchangeRates();
          }
        }
      },
    );
  }

  /**
   * Get the user's tokens for the given chain.
   *
   * @param chainId - The chain ID.
   * @returns The list of tokens addresses for the current chain
   */
  #getTokenAddresses(chainId: Hex): Hex[] {
    const selectedAccount = this.messagingSystem.call(
      'AccountsController:getAccount',
      this.#selectedAccountId,
    );
    const selectedAddress = selectedAccount?.address ?? '';
    const tokens = this.#allTokens[chainId]?.[selectedAddress] || [];
    const detectedTokens =
      this.#allDetectedTokens[chainId]?.[selectedAddress] || [];

    return [
      ...new Set(
        [...tokens, ...detectedTokens].map((token) =>
          toHex(toChecksumHexAddress(token.address)),
        ),
      ),
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

  /**
   * Start (or restart) polling.
   */
  async start() {
    this.#stopPoll();
    this.#pollState = PollState.Active;
    await this.#poll();
  }

  /**
   * Stop polling.
   */
  stop() {
    this.#stopPoll();
    this.#pollState = PollState.Inactive;
  }

  #getSelectedAccount(): InternalAccount {
    const selectedAccount = this.messagingSystem.call(
      'AccountsController:getSelectedAccount',
    );

    return selectedAccount;
  }

  #getChainIdAndTicker(): {
    chainId: Hex;
    ticker: string;
  } {
    const { selectedNetworkClientId } = this.messagingSystem.call(
      'NetworkController:getState',
    );
    const networkClient = this.messagingSystem.call(
      'NetworkController:getNetworkClientById',
      selectedNetworkClientId,
    );
    return {
      chainId: networkClient.configuration.chainId,
      ticker: networkClient.configuration.ticker,
    };
  }

  #getTokensControllerState(): {
    allTokens: TokensControllerState['allTokens'];
    allDetectedTokens: TokensControllerState['allDetectedTokens'];
  } {
    const { allTokens, allDetectedTokens } = this.messagingSystem.call(
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
   */
  async #poll() {
    await safelyExecute(() => this.updateExchangeRates());

    // Poll using recursive `setTimeout` instead of `setInterval` so that
    // requests don't stack if they take longer than the polling interval
    this.#handle = setTimeout(() => {
      // TODO: Either fix this lint violation or explain why it's necessary to ignore.
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      this.#poll();
    }, this.#interval);
  }

  /**
   * Updates exchange rates for all tokens.
   */
  async updateExchangeRates() {
    await this.updateExchangeRatesByChainId({
      chainId: this.#chainId,
      nativeCurrency: this.#ticker,
    });
  }

  /**
   * Updates exchange rates for all tokens.
   *
   * @param options - The options to fetch exchange rates.
   * @param options.chainId - The chain ID.
   * @param options.nativeCurrency - The ticker for the chain.
   */
  async updateExchangeRatesByChainId({
    chainId,
    nativeCurrency,
  }: {
    chainId: Hex;
    nativeCurrency: string;
  }) {
    if (this.#disabled) {
      return;
    }

    const tokenAddresses = this.#getTokenAddresses(chainId);

    const updateKey: `${Hex}:${string}` = `${chainId}:${nativeCurrency}`;
    if (updateKey in this.#inProcessExchangeRateUpdates) {
      // This prevents redundant updates
      // This promise is resolved after the in-progress update has finished,
      // and state has been updated.
      await this.#inProcessExchangeRateUpdates[updateKey];
      return;
    }

    const {
      promise: inProgressUpdate,
      resolve: updateSucceeded,
      reject: updateFailed,
    } = createDeferredPromise({ suppressUnhandledRejection: true });
    this.#inProcessExchangeRateUpdates[updateKey] = inProgressUpdate;

    try {
      const contractInformations = await this.#fetchAndMapExchangeRates({
        tokenAddresses,
        chainId,
        nativeCurrency,
      });

      const marketData = {
        [chainId]: {
          ...(contractInformations ?? {}),
        },
      };

      this.update((state) => {
        state.marketData = marketData;
      });
      updateSucceeded();
    } catch (error: unknown) {
      updateFailed(error);
      throw error;
    } finally {
      delete this.#inProcessExchangeRateUpdates[updateKey];
    }
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
      tokenAddresses,
      nativeCurrency,
    });
  }

  /**
   * Updates token rates for the given networkClientId
   *
   * @param networkClientId - The network client ID used to get a ticker value.
   * @returns The controller state.
   */
  async _executePoll(networkClientId: NetworkClientId): Promise<void> {
    const networkClient = this.messagingSystem.call(
      'NetworkController:getNetworkClientById',
      networkClientId,
    );
    await this.updateExchangeRatesByChainId({
      chainId: networkClient.configuration.chainId,
      nativeCurrency: networkClient.configuration.ticker,
    });
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
        [ZERO_ADDRESS]: {
          currency: nativeCurrency,
          ...contractNativeInformationsNative[ZERO_ADDRESS],
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
   * @param args.tokenAddresses - Addresses for tokens.
   * @param args.nativeCurrency - The native currency in which to request
   * prices.
   * @returns A map of the token addresses (as checksums) to their prices in the
   * native currency.
   */
  async #fetchAndMapExchangeRatesForUnsupportedNativeCurrency({
    tokenAddresses,
    nativeCurrency,
  }: {
    tokenAddresses: Hex[];
    nativeCurrency: string;
  }): Promise<ContractMarketData> {
    const [
      contractExchangeInformations,
      fallbackCurrencyToNativeCurrencyConversionRate,
    ] = await Promise.all([
      this.#fetchAndMapExchangeRatesForSupportedNativeCurrency({
        tokenAddresses,
        chainId: this.#chainId,
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

    const updatedContractExchangeRates = Object.entries(
      contractExchangeInformations,
    ).reduce((acc, [tokenAddress, token]) => {
      acc = {
        ...acc,
        [tokenAddress]: {
          ...token,
          price: token.price
            ? token.price * fallbackCurrencyToNativeCurrencyConversionRate
            : undefined,
        },
      };
      return acc;
    }, {});

    return updatedContractExchangeRates;
  }
}

export default TokenRatesController;
