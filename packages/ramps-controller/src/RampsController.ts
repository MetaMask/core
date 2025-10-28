import type {
  ControllerGetStateAction,
  ControllerStateChangeEvent,
} from '@metamask/base-controller';
import { BaseController } from '@metamask/base-controller';
import type { Messenger } from '@metamask/messenger';
import {
  OnRampSdk,
  Environment,
  Context,
  RegionsService,
  OrdersService,
  Payment,
  CryptoCurrency,
  FiatCurrency,
  Provider,
  Limits,
  AllQuotesResponse,
  AllSellQuotesResponse,
  Order,
} from '@consensys/on-ramp-sdk';

const controllerName = 'RampsController';

/**
 * Country support information
 */
export interface CountrySupport {
  buy: boolean;
  sell: boolean;
}

/**
 * State information for countries
 */
export interface State {
  id: string;
  name: string;
  emoji?: string;
  unsupported?: boolean; // deprecated - use support field instead
  support?: CountrySupport;
  recommended?: boolean;
  detected?: boolean;
  stateId?: string;
}

/**
 * Country information
 */
export interface Country {
  id: string;
  name: string;
  emoji: string;
  currencies: string[];
  unsupported?: boolean; // deprecated - use support field instead
  hidden?: boolean;
  states?: State[];
  support?: CountrySupport;
  recommended?: boolean;
  enableSell?: boolean;
  detected?: boolean;
}

/**
 * Ramps controller state
 */
export type RampsControllerState = Record<string, string>;

export type RampsControllerGetStateAction = ControllerGetStateAction<
  typeof controllerName,
  RampsControllerState
>;

export type RampsControllerGetCountriesAction = {
  type: `${typeof controllerName}:getCountries`;
  handler: RampsController['getCountries'];
};

export type RampsControllerGetSellCountriesAction = {
  type: `${typeof controllerName}:getSellCountries`;
  handler: RampsController['getSellCountries'];
};

export type RampsControllerGetPaymentMethodsAction = {
  type: `${typeof controllerName}:getPaymentMethods`;
  handler: RampsController['getPaymentMethods'];
};

export type RampsControllerGetPaymentMethodsForCryptoAction = {
  type: `${typeof controllerName}:getPaymentMethodsForCrypto`;
  handler: RampsController['getPaymentMethodsForCrypto'];
};

export type RampsControllerGetSellPaymentMethodsAction = {
  type: `${typeof controllerName}:getSellPaymentMethods`;
  handler: RampsController['getSellPaymentMethods'];
};

export type RampsControllerGetSellPaymentMethodsForCryptoAction = {
  type: `${typeof controllerName}:getSellPaymentMethodsForCrypto`;
  handler: RampsController['getSellPaymentMethodsForCrypto'];
};

export type RampsControllerGetCryptoCurrenciesAction = {
  type: `${typeof controllerName}:getCryptoCurrencies`;
  handler: RampsController['getCryptoCurrencies'];
};

export type RampsControllerGetSellCryptoCurrenciesAction = {
  type: `${typeof controllerName}:getSellCryptoCurrencies`;
  handler: RampsController['getSellCryptoCurrencies'];
};

export type RampsControllerGetCryptoCurrencyAction = {
  type: `${typeof controllerName}:getCryptoCurrency`;
  handler: RampsController['getCryptoCurrency'];
};

export type RampsControllerGetFiatCurrenciesAction = {
  type: `${typeof controllerName}:getFiatCurrencies`;
  handler: RampsController['getFiatCurrencies'];
};

export type RampsControllerGetSellFiatCurrenciesAction = {
  type: `${typeof controllerName}:getSellFiatCurrencies`;
  handler: RampsController['getSellFiatCurrencies'];
};

export type RampsControllerGetFiatCurrencyAction = {
  type: `${typeof controllerName}:getFiatCurrency`;
  handler: RampsController['getFiatCurrency'];
};

export type RampsControllerGetAllFiatCurrenciesAction = {
  type: `${typeof controllerName}:getAllFiatCurrencies`;
  handler: RampsController['getAllFiatCurrencies'];
};

export type RampsControllerGetAllCryptoCurrenciesAction = {
  type: `${typeof controllerName}:getAllCryptoCurrencies`;
  handler: RampsController['getAllCryptoCurrencies'];
};

export type RampsControllerGetNetworkDetailsAction = {
  type: `${typeof controllerName}:getNetworkDetails`;
  handler: RampsController['getNetworkDetails'];
};

export type RampsControllerGetLimitsAction = {
  type: `${typeof controllerName}:getLimits`;
  handler: RampsController['getLimits'];
};

export type RampsControllerGetSellLimitsAction = {
  type: `${typeof controllerName}:getSellLimits`;
  handler: RampsController['getSellLimits'];
};

export type RampsControllerGetQuotesAction = {
  type: `${typeof controllerName}:getQuotes`;
  handler: RampsController['getQuotes'];
};

export type RampsControllerGetSellQuotesAction = {
  type: `${typeof controllerName}:getSellQuotes`;
  handler: RampsController['getSellQuotes'];
};

export type RampsControllerGetOrderIdFromCallbackAction = {
  type: `${typeof controllerName}:getOrderIdFromCallback`;
  handler: RampsController['getOrderIdFromCallback'];
};

export type RampsControllerGetOrderFromCallbackAction = {
  type: `${typeof controllerName}:getOrderFromCallback`;
  handler: RampsController['getOrderFromCallback'];
};

export type RampsControllerGetSellOrderFromCallbackAction = {
  type: `${typeof controllerName}:getSellOrderFromCallback`;
  handler: RampsController['getSellOrderFromCallback'];
};

export type RampsControllerGetOrderAction = {
  type: `${typeof controllerName}:getOrder`;
  handler: RampsController['getOrder'];
};

export type RampsControllerGetSellOrderAction = {
  type: `${typeof controllerName}:getSellOrder`;
  handler: RampsController['getSellOrder'];
};

export type RampsControllerSubmitApplePayOrderAction = {
  type: `${typeof controllerName}:submitApplePayOrder`;
  handler: RampsController['submitApplePayOrder'];
};

export type RampsControllerGetProviderAction = {
  type: `${typeof controllerName}:getProvider`;
  handler: RampsController['getProvider'];
};

export type RampsControllerGetRecurringOrdersAction = {
  type: `${typeof controllerName}:getRecurringOrders`;
  handler: RampsController['getRecurringOrders'];
};

export type RampsControllerAddRedirectionListenerAction = {
  type: `${typeof controllerName}:addRedirectionListener`;
  handler: RampsController['addRedirectionListener'];
};

export type RampsControllerActions =
  | RampsControllerGetStateAction
  | RampsControllerGetCountriesAction
  | RampsControllerGetSellCountriesAction
  | RampsControllerGetPaymentMethodsAction
  | RampsControllerGetPaymentMethodsForCryptoAction
  | RampsControllerGetSellPaymentMethodsAction
  | RampsControllerGetSellPaymentMethodsForCryptoAction
  | RampsControllerGetCryptoCurrenciesAction
  | RampsControllerGetSellCryptoCurrenciesAction
  | RampsControllerGetCryptoCurrencyAction
  | RampsControllerGetFiatCurrenciesAction
  | RampsControllerGetSellFiatCurrenciesAction
  | RampsControllerGetFiatCurrencyAction
  | RampsControllerGetAllFiatCurrenciesAction
  | RampsControllerGetAllCryptoCurrenciesAction
  | RampsControllerGetNetworkDetailsAction
  | RampsControllerGetLimitsAction
  | RampsControllerGetSellLimitsAction
  | RampsControllerGetQuotesAction
  | RampsControllerGetSellQuotesAction
  | RampsControllerGetOrderIdFromCallbackAction
  | RampsControllerGetOrderFromCallbackAction
  | RampsControllerGetSellOrderFromCallbackAction
  | RampsControllerGetOrderAction
  | RampsControllerGetSellOrderAction
  | RampsControllerSubmitApplePayOrderAction
  | RampsControllerGetProviderAction
  | RampsControllerGetRecurringOrdersAction
  | RampsControllerAddRedirectionListenerAction;

export type RampsControllerStateChangeEvent = ControllerStateChangeEvent<
  typeof controllerName,
  RampsControllerState
>;

export type RampsControllerEvents = RampsControllerStateChangeEvent;

export type RampsControllerMessenger = Messenger<
  typeof controllerName,
  RampsControllerActions,
  RampsControllerEvents
>;

const rampsControllerMetadata = {
  metamaskEnvironment: {
    persist: true,
    anonymous: true,
    includeInDebugSnapshot: true,
    includeInStateLogs: true,
    usedInUi: true,
  },
  context: {
    persist: true,
    anonymous: true,
    includeInDebugSnapshot: true,
    includeInStateLogs: true,
    usedInUi: true,
  },
};

const defaultState: RampsControllerState = {
  metamaskEnvironment: 'staging',
  context: Context.Browser,
};

export function getSdkEnvironment(metamaskEnvironment: string) {
  switch (metamaskEnvironment) {
    case 'production':
    case 'beta':
    case 'rc':
      return Environment.Production;

    case 'dev':
    case 'exp':
    case 'test':
    case 'e2e':
    default:
      return Environment.Staging;
  }
}

/**
 * Controller that manages on-ramp and off-ramp operations.
 * The ramps controller is responsible for handling cryptocurrency purchase and sale operations.
 *
 */
export class RampsController extends BaseController<
  typeof controllerName,
  RampsControllerState,
  RampsControllerMessenger
> {
  readonly #sdk: OnRampSdk;

  /**
   * Constructor for RampsController.
   *
   * @param options - The controller options.
   * @param options.messenger - The messenger object.
   * @param options.state - Initial state to set on this controller
   */
  constructor({
    messenger,
    state,
  }: {
    messenger: RampsControllerMessenger;
    state?: Partial<RampsControllerState>;
  }) {
    super({
      messenger,
      name: controllerName,
      metadata: rampsControllerMetadata,
      state: { ...defaultState, ...state } as RampsControllerState,
    });

    // Initialize the OnRampSDK
    const environment = state?.metamaskEnvironment ?? Environment.Staging;
    const context = state?.context ?? Context.Browser;
    this.#sdk = OnRampSdk.create(getSdkEnvironment(environment), context as Context);

    this.#registerMessageHandlers();
  }

  /**
   * Helper method to get the cached regions service
   */
  async #getRegionsService(): Promise<RegionsService> {
    return this.#sdk.regions();
  }

  /**
   * Helper method to get the cached orders service
   */
  async #getOrdersService(): Promise<OrdersService> {
    return this.#sdk.orders();
  }

  /**
   * Get list of countries available for ramps.
   *
   * @returns A promise that resolves to an array of countries
   */
  async getCountries(): Promise<Country[]> {
    const regionsService = await this.#getRegionsService();
    return regionsService.getCountries();
  }

  /**
   * Get list of countries available for sell operations.
   *
   * @returns A promise that resolves to an array of countries
   */
  async getSellCountries(): Promise<Country[]> {
    const regionsService = await this.#getRegionsService();
    return regionsService.getSellCountries();
  }

  /**
   * Get payment methods for a region.
   *
   * @param regionId - The region ID
   * @param abortController - Optional abort controller
   * @returns A promise that resolves to an array of payment methods
   */
  async getPaymentMethods(
    regionId: string,
    abortController?: AbortController,
  ): Promise<Payment[]> {
    const regionsService = await this.#getRegionsService();
    return regionsService.getPaymentMethods(regionId, abortController);
  }

  /**
   * Get payment methods for crypto transactions.
   *
   * @param regionId - The region ID
   * @param crypto - The crypto currency code
   * @param fiat - The fiat currency code
   * @param abortController - Optional abort controller
   * @returns A promise that resolves to an array of payment methods
   */
  async getPaymentMethodsForCrypto(
    regionId: string,
    crypto: string,
    fiat: string,
    abortController?: AbortController,
  ): Promise<Payment[]> {
    const regionsService = await this.#getRegionsService();
    return regionsService.getPaymentMethodsForCrypto(
      regionId,
      crypto,
      fiat,
      abortController,
    );
  }

  /**
   * Get sell payment methods for a region.
   *
   * @param regionId - The region ID
   * @param abortController - Optional abort controller
   * @returns A promise that resolves to an array of payment methods
   */
  async getSellPaymentMethods(
    regionId: string,
    abortController?: AbortController,
  ): Promise<Payment[]> {
    const regionsService = await this.#getRegionsService();
    return regionsService.getSellPaymentMethods(regionId, abortController);
  }

  /**
   * Get sell payment methods for crypto.
   *
   * @param regionId - The region ID
   * @param crypto - The crypto currency code
   * @param fiat - The fiat currency code
   * @param abortController - Optional abort controller
   * @returns A promise that resolves to an array of payment methods
   */
  async getSellPaymentMethodsForCrypto(
    regionId: string,
    crypto: string,
    fiat: string,
    abortController?: AbortController,
  ): Promise<Payment[]> {
    const regionsService = await this.#getRegionsService();
    return regionsService.getSellPaymentMethodsForCrypto(
      regionId,
      crypto,
      fiat,
      abortController,
    );
  }

  /**
   * Get crypto currencies.
   *
   * @param regionId - The region ID
   * @param paymentMethodIds - Array of payment method IDs
   * @param fiatCurrencyId - Optional fiat currency ID
   * @param abortController - Optional abort controller
   * @returns A promise that resolves to an array of crypto currencies
   */
  async getCryptoCurrencies(
    regionId: string,
    paymentMethodIds: string[],
    fiatCurrencyId?: string,
    abortController?: AbortController,
  ): Promise<CryptoCurrency[]> {
    const regionsService = await this.#getRegionsService();
    return regionsService.getCryptoCurrencies(
      regionId,
      paymentMethodIds,
      fiatCurrencyId,
      abortController,
    );
  }

  /**
   * Get sell crypto currencies.
   *
   * @param regionId - The region ID
   * @param paymentMethodIds - Array of payment method IDs
   * @param fiatCurrencyId - Optional fiat currency ID
   * @param abortController - Optional abort controller
   * @returns A promise that resolves to an array of crypto currencies
   */
  async getSellCryptoCurrencies(
    regionId: string,
    paymentMethodIds: string[],
    fiatCurrencyId?: string,
    abortController?: AbortController,
  ): Promise<CryptoCurrency[]> {
    const regionsService = await this.#getRegionsService();
    return regionsService.getSellCryptoCurrencies(
      regionId,
      paymentMethodIds,
      fiatCurrencyId,
      abortController,
    );
  }

  /**
   * Get a specific crypto currency.
   *
   * @param regionId - The region ID
   * @param cryptoId - The crypto currency ID
   * @returns A promise that resolves to a crypto currency
   */
  async getCryptoCurrency(
    regionId: string,
    cryptoId: string,
  ): Promise<CryptoCurrency> {
    const regionsService = await this.#getRegionsService();
    return regionsService.getCryptoCurrency(regionId, cryptoId);
  }

  /**
   * Get fiat currencies.
   *
   * @param regionId - The region ID
   * @param paymentMethodIds - Array of payment method IDs
   * @param abortController - Optional abort controller
   * @returns A promise that resolves to an array of fiat currencies
   */
  async getFiatCurrencies(
    regionId: string,
    paymentMethodIds: string[],
    abortController?: AbortController,
  ): Promise<FiatCurrency[]> {
    const regionsService = await this.#getRegionsService();
    return regionsService.getFiatCurrencies(
      regionId,
      paymentMethodIds,
      abortController,
    );
  }

  /**
   * Get sell fiat currencies.
   *
   * @param regionId - The region ID
   * @param paymentMethodIds - Array of payment method IDs
   * @param abortController - Optional abort controller
   * @returns A promise that resolves to an array of fiat currencies
   */
  async getSellFiatCurrencies(
    regionId: string,
    paymentMethodIds: string[],
    abortController?: AbortController,
  ): Promise<FiatCurrency[]> {
    const regionsService = await this.#getRegionsService();
    return regionsService.getSellFiatCurrencies(
      regionId,
      paymentMethodIds,
      abortController,
    );
  }

  /**
   * Get a specific fiat currency.
   *
   * @param regionId - The region ID
   * @param fiatId - The fiat currency ID
   * @returns A promise that resolves to a fiat currency
   */
  async getFiatCurrency(regionId: string, fiatId: string): Promise<FiatCurrency> {
    const regionsService = await this.#getRegionsService();
    return regionsService.getFiatCurrency(regionId, fiatId);
  }

  /**
   * Get all fiat currencies.
   *
   * @param regionId - The region ID
   * @param abortController - Optional abort controller
   * @returns A promise that resolves to an array of fiat currencies
   */
  async getAllFiatCurrencies(
    regionId: string,
    abortController?: AbortController,
  ): Promise<FiatCurrency[]> {
    const regionsService = await this.#getRegionsService();
    return regionsService.getAllFiatCurrencies(regionId, abortController);
  }

  /**
   * Get all crypto currencies.
   *
   * @param regionId - The region ID
   * @param abortController - Optional abort controller
   * @returns A promise that resolves to an array of crypto currencies
   */
  async getAllCryptoCurrencies(
    regionId: string,
    abortController?: AbortController,
  ): Promise<CryptoCurrency[]> {
    const regionsService = await this.#getRegionsService();
    return regionsService.getAllCryptoCurrencies(regionId, abortController);
  }

  /**
   * Get network details.
   *
   * @returns A promise that resolves to an array of network details
   */
  async getNetworkDetails(): Promise<any[]> {
    const regionsService = await this.#getRegionsService();
    return regionsService.getNetworkDetails();
  }

  /**
   * Get limits.
   *
   * @param regionId - The region ID
   * @param paymentMethods - Array of payment method IDs
   * @param crypto - The crypto currency code
   * @param fiat - The fiat currency code
   * @param abortController - Optional abort controller
   * @returns A promise that resolves to limits
   */
  async getLimits(
    regionId: string,
    paymentMethods: string[],
    crypto: string,
    fiat: string,
    abortController?: AbortController,
  ): Promise<Limits> {
    const regionsService = await this.#getRegionsService();
    return regionsService.getLimits(
      regionId,
      paymentMethods,
      crypto,
      fiat,
      abortController,
    );
  }

  /**
   * Get sell limits.
   *
   * @param regionId - The region ID
   * @param paymentMethods - Array of payment method IDs
   * @param crypto - The crypto currency code
   * @param fiat - The fiat currency code
   * @returns A promise that resolves to limits
   */
  async getSellLimits(
    regionId: string,
    paymentMethods: string[],
    crypto: string,
    fiat: string,
  ): Promise<Limits> {
    const regionsService = await this.#getRegionsService();
    return regionsService.getSellLimits(regionId, paymentMethods, crypto, fiat);
  }

  /**
   * Get quotes.
   *
   * @param regionId - The region ID
   * @param paymentMethods - Array of payment method IDs
   * @param crypto - The crypto currency code
   * @param fiat - The fiat currency code
   * @param amount - The amount
   * @param receiver - Optional receiver address
   * @param abortController - Optional abort controller
   * @returns A promise that resolves to quotes
   */
  async getQuotes(
    regionId: string,
    paymentMethods: string[],
    crypto: string,
    fiat: string,
    amount: number | string,
    receiver?: string,
    abortController?: AbortController,
  ): Promise<AllQuotesResponse> {
    const regionsService = await this.#getRegionsService();
    return regionsService.getQuotes(
      regionId,
      paymentMethods,
      crypto,
      fiat,
      amount,
      receiver,
      abortController,
    );
  }

  /**
   * Get sell quotes.
   *
   * @param regionId - The region ID
   * @param paymentMethods - Array of payment method IDs
   * @param crypto - The crypto currency code
   * @param fiat - The fiat currency code
   * @param amount - The amount
   * @param receiver - Optional receiver address
   * @param abortController - Optional abort controller
   * @returns A promise that resolves to sell quotes
   */
  async getSellQuotes(
    regionId: string,
    paymentMethods: string[],
    crypto: string,
    fiat: string,
    amount: number | string,
    receiver?: string,
    abortController?: AbortController,
  ): Promise<AllSellQuotesResponse> {
    const regionsService = await this.#getRegionsService();
    return regionsService.getSellQuotes(
      regionId,
      paymentMethods,
      crypto,
      fiat,
      amount,
      receiver,
      abortController,
    );
  }

  // OrdersService wrapper methods

  /**
   * Get order ID from callback URL.
   *
   * @param providerId - The provider ID
   * @param redirectUrl - The redirect URL
   * @returns A promise that resolves to the order ID
   */
  async getOrderIdFromCallback(
    providerId: string,
    redirectUrl: string,
  ): Promise<string> {
    const ordersService = await this.#getOrdersService();
    return ordersService.getOrderIdFromCallback(providerId, redirectUrl);
  }

  /**
   * Get order from callback URL.
   *
   * @param providerId - The provider ID
   * @param redirectUrl - The redirect URL
   * @param walletAddress - The wallet address
   * @returns A promise that resolves to the order
   */
  async getOrderFromCallback(
    providerId: string,
    redirectUrl: string,
    walletAddress: string,
  ): Promise<Order> {
    const ordersService = await this.#getOrdersService();
    return ordersService.getOrderFromCallback(
      providerId,
      redirectUrl,
      walletAddress,
    );
  }

  /**
   * Get sell order from callback URL.
   *
   * @param providerId - The provider ID
   * @param redirectUrl - The redirect URL
   * @param walletAddress - The wallet address
   * @returns A promise that resolves to the sell order
   */
  async getSellOrderFromCallback(
    providerId: string,
    redirectUrl: string,
    walletAddress: string,
  ): Promise<Order> {
    const ordersService = await this.#getOrdersService();
    return ordersService.getSellOrderFromCallback(
      providerId,
      redirectUrl,
      walletAddress,
    );
  }

  /**
   * Get order by ID.
   *
   * @param orderId - The order ID
   * @param walletAddress - The wallet address
   * @returns A promise that resolves to the order
   */
  async getOrder(orderId: string, walletAddress: string): Promise<Order> {
    const ordersService = await this.#getOrdersService();
    return ordersService.getOrder(orderId, walletAddress);
  }

  /**
   * Get sell order by ID.
   *
   * @param orderId - The order ID
   * @param walletAddress - The wallet address
   * @returns A promise that resolves to the sell order
   */
  async getSellOrder(orderId: string, walletAddress: string): Promise<Order> {
    const ordersService = await this.#getOrdersService();
    return ordersService.getSellOrder(orderId, walletAddress);
  }

  /**
   * Submit Apple Pay order.
   *
   * @param dest - The destination address
   * @param providerId - The provider ID
   * @param payload - The Apple Pay payload
   * @returns A promise that resolves to the Apple Pay purchase result
   */
  async submitApplePayOrder(
    dest: string,
    providerId: string,
    payload: any,
  ): Promise<any> {
    const ordersService = await this.#getOrdersService();
    return ordersService.submitApplePayOrder(dest, providerId, payload);
  }

  /**
   * Get provider by ID.
   *
   * @param providerId - The provider ID
   * @returns A promise that resolves to the provider
   */
  async getProvider(providerId: string): Promise<Provider> {
    const ordersService = await this.#getOrdersService();
    return ordersService.getProvider(providerId);
  }

  /**
   * Get recurring orders.
   *
   * @param orderId - The order ID
   * @param walletAddress - The wallet address
   * @param start - The start date
   * @param end - The end date
   * @returns A promise that resolves to the recurring orders
   */
  async getRecurringOrders(
    orderId: string,
    walletAddress: string,
    start: Date,
    end: Date,
  ): Promise<any> {
    const ordersService = await this.#getOrdersService();
    return ordersService.getRecurringOrders(orderId, walletAddress, start, end);
  }

  /**
   * Add redirection listener.
   *
   * @param callback - The callback function
   */
  addRedirectionListener(
    callback: (orderId: string) => void | Promise<void>,
  ): void {
    // Note: This method doesn't need async since it's synchronous
    this.#getOrdersService().then((ordersService) => {
      ordersService.addRedirectionListener(callback);
    });
  }

  /**
   * Registers message handlers for the RampsController.
   */
  #registerMessageHandlers() {
    // RegionsService methods
    this.messenger.registerActionHandler(
      `${controllerName}:getCountries`,
      this.getCountries.bind(this),
    );
    this.messenger.registerActionHandler(
      `${controllerName}:getSellCountries`,
      this.getSellCountries.bind(this),
    );
    this.messenger.registerActionHandler(
      `${controllerName}:getPaymentMethods`,
      this.getPaymentMethods.bind(this),
    );
    this.messenger.registerActionHandler(
      `${controllerName}:getPaymentMethodsForCrypto`,
      this.getPaymentMethodsForCrypto.bind(this),
    );
    this.messenger.registerActionHandler(
      `${controllerName}:getSellPaymentMethods`,
      this.getSellPaymentMethods.bind(this),
    );
    this.messenger.registerActionHandler(
      `${controllerName}:getSellPaymentMethodsForCrypto`,
      this.getSellPaymentMethodsForCrypto.bind(this),
    );
    this.messenger.registerActionHandler(
      `${controllerName}:getCryptoCurrencies`,
      this.getCryptoCurrencies.bind(this),
    );
    this.messenger.registerActionHandler(
      `${controllerName}:getSellCryptoCurrencies`,
      this.getSellCryptoCurrencies.bind(this),
    );
    this.messenger.registerActionHandler(
      `${controllerName}:getCryptoCurrency`,
      this.getCryptoCurrency.bind(this),
    );
    this.messenger.registerActionHandler(
      `${controllerName}:getFiatCurrencies`,
      this.getFiatCurrencies.bind(this),
    );
    this.messenger.registerActionHandler(
      `${controllerName}:getSellFiatCurrencies`,
      this.getSellFiatCurrencies.bind(this),
    );
    this.messenger.registerActionHandler(
      `${controllerName}:getFiatCurrency`,
      this.getFiatCurrency.bind(this),
    );
    this.messenger.registerActionHandler(
      `${controllerName}:getAllFiatCurrencies`,
      this.getAllFiatCurrencies.bind(this),
    );
    this.messenger.registerActionHandler(
      `${controllerName}:getAllCryptoCurrencies`,
      this.getAllCryptoCurrencies.bind(this),
    );
    this.messenger.registerActionHandler(
      `${controllerName}:getNetworkDetails`,
      this.getNetworkDetails.bind(this),
    );
    this.messenger.registerActionHandler(
      `${controllerName}:getLimits`,
      this.getLimits.bind(this),
    );
    this.messenger.registerActionHandler(
      `${controllerName}:getSellLimits`,
      this.getSellLimits.bind(this),
    );
    this.messenger.registerActionHandler(
      `${controllerName}:getQuotes`,
      this.getQuotes.bind(this),
    );
    this.messenger.registerActionHandler(
      `${controllerName}:getSellQuotes`,
      this.getSellQuotes.bind(this),
    );

    // OrdersService methods
    this.messenger.registerActionHandler(
      `${controllerName}:getOrderIdFromCallback`,
      this.getOrderIdFromCallback.bind(this),
    );
    this.messenger.registerActionHandler(
      `${controllerName}:getOrderFromCallback`,
      this.getOrderFromCallback.bind(this),
    );
    this.messenger.registerActionHandler(
      `${controllerName}:getSellOrderFromCallback`,
      this.getSellOrderFromCallback.bind(this),
    );
    this.messenger.registerActionHandler(
      `${controllerName}:getOrder`,
      this.getOrder.bind(this),
    );
    this.messenger.registerActionHandler(
      `${controllerName}:getSellOrder`,
      this.getSellOrder.bind(this),
    );
    this.messenger.registerActionHandler(
      `${controllerName}:submitApplePayOrder`,
      this.submitApplePayOrder.bind(this),
    );
    this.messenger.registerActionHandler(
      `${controllerName}:getProvider`,
      this.getProvider.bind(this),
    );
    this.messenger.registerActionHandler(
      `${controllerName}:getRecurringOrders`,
      this.getRecurringOrders.bind(this),
    );
    this.messenger.registerActionHandler(
      `${controllerName}:addRedirectionListener`,
      this.addRedirectionListener.bind(this),
    );
  }
}

export default RampsController;

