import type {
  CreateServicePolicyOptions,
  ServicePolicy,
} from '@metamask/controller-utils';
import { createServicePolicy, HttpError } from '@metamask/controller-utils';
import type { Messenger } from '@metamask/messenger';

import type { RampsServiceMethodActions } from './RampsService-method-action-types';
import packageJson from '../package.json';

/**
 * Represents phone number information for a country.
 */
export type CountryPhone = {
  prefix: string;
  placeholder: string;
  template: string;
};

/**
 * Indicates whether a region supports buy and/or sell actions.
 */
export type SupportedActions = {
  /**
   * Whether buy actions are supported.
   */
  buy: boolean;
  /**
   * Whether sell actions are supported.
   */
  sell: boolean;
};

/**
 * Represents a state/province within a country.
 */
export type State = {
  /**
   * State identifier. Can be in path format (e.g., "/regions/us-ut") or ISO code format (e.g., "us-ut").
   */
  id?: string;
  /**
   * State name.
   */
  name?: string;
  /**
   * ISO state code (e.g., "UT", "NY").
   */
  stateId?: string;
  /**
   * Whether this state is supported for buy and/or sell ramp actions.
   */
  supported?: SupportedActions;
  /**
   * Whether this state is recommended.
   */
  recommended?: boolean;
};

/**
 * Represents a provider link.
 */
export type ProviderLink = {
  name: string;
  url: string;
};

/**
 * Represents provider logos.
 */
export type ProviderLogos = {
  light: string;
  dark: string;
  height: number;
  width: number;
};

/**
 * Browser type for provider buy features.
 */
export type ProviderBrowserType = 'APP_BROWSER' | 'IN_APP_OS_BROWSER' | null;

/**
 * Represents a ramp provider.
 */
export type Provider = {
  id: string;
  name: string;
  environmentType: string;
  description: string;
  hqAddress: string;
  links: ProviderLink[];
  logos: ProviderLogos;
  supportedCryptoCurrencies?: Record<string, boolean>;
  supportedFiatCurrencies?: Record<string, boolean>;
  supportedPaymentMethods?: Record<string, boolean>;
};

/**
 * Represents a payment method for funding a purchase.
 */
export type PaymentMethod = {
  /**
   * Canonical payment method ID (e.g., "/payments/debit-credit-card").
   */
  id: string;
  /**
   * Payment type identifier (e.g., "debit-credit-card", "bank-transfer").
   */
  paymentType: string;
  /**
   * User-facing name for the payment method.
   */
  name: string;
  /**
   * Score for sorting payment methods (higher is better).
   */
  score: number;
  /**
   * Icon identifier for the payment method.
   */
  icon: string;
  /**
   * Localized disclaimer text (optional).
   */
  disclaimer?: string;
  /**
   * Delay in minutes (e.g., [5, 10]).
   */
  delay?: number[];
  /**
   * Localized pending order description (optional).
   */
  pendingOrderDescription?: string;
  /**
   * Whether this payment method is a manual bank transfer.
   */
  isManualBankTransfer?: boolean;
};

/**
 * Response from the paymentMethods API.
 */
export type PaymentMethodsResponse = {
  /**
   * List of available payment methods.
   */
  payments: PaymentMethod[];
  /**
   * Recommended sorting for payment methods.
   */
  sort?: {
    ids: string[];
    sortBy: string;
  };
};

// === QUOTES TYPES ===

/**
 * Sort criteria for quotes.
 */
export type QuoteSortBy = 'price' | 'reliability';

/**
 * Represents crypto translation info for a quote.
 */
export type QuoteCryptoTranslation = {
  /**
   * The crypto currency ID.
   */
  id?: string;
  /**
   * The crypto symbol.
   */
  symbol?: string;
  /**
   * The chain ID.
   */
  chainId?: string;
};

/**
 * Widget information for executing a buy order.
 */
export type BuyWidget = {
  /**
   * The widget URL to open for the user to complete the purchase.
   */
  url: string;
  /**
   * The browser type to use for opening the widget.
   */
  browser?: ProviderBrowserType;
  /**
   * Order ID if already created.
   */
  orderId?: string | null;
};

/**
 * Represents an individual quote from a provider.
 */
export type Quote = {
  /**
   * The provider ID (e.g., "/providers/moonpay").
   */
  provider: string;
  /**
   * The quote details.
   */
  quote: {
    /**
     * The amount the user is paying (in fiat for buy, crypto for sell).
     */
    amountIn: number | string;
    /**
     * The amount the user will receive (in crypto for buy, fiat for sell).
     */
    amountOut: number | string;
    /**
     * The payment method used for this quote.
     */
    paymentMethod: string;
    /**
     * The fiat value of the output amount (for buy actions).
     */
    amountOutInFiat?: number;
    /**
     * Crypto translation info for display.
     */
    cryptoTranslation?: QuoteCryptoTranslation;
    /**
     * Total fees in the source currency.
     */
    totalFees?: number | string;
    /**
     * Network fees.
     */
    networkFee?: number | string;
    /**
     * Provider fees.
     */
    providerFee?: number | string;
    /**
     * Buy URL endpoint that returns the actual provider widget URL.
     *
     * This is a MetaMask-hosted endpoint that, when fetched, returns JSON with the provider's widget URL.
     *
     * @deprecated Use buyWidget instead - it's embedded in the quote response.
     */
    buyURL?: string;
    /**
     * Widget information embedded in the quote response.
     * Contains the widget URL, browser type, and optional pre-order tracking ID.
     */
    buyWidget?: BuyWidget;
  };
  /**
   * Metadata about the quote.
   */
  metadata?: {
    /**
     * Reliability score for the provider (0-100).
     */
    reliability?: number;
    /**
     * Tags for the quote.
     */
    tags?: {
      /**
       * Whether this is the best rate quote.
       */
      isBestRate?: boolean;
      /**
       * Whether this is the most reliable provider.
       */
      isMostReliable?: boolean;
    };
  };
};

/**
 * Represents an error from a provider when fetching quotes.
 */
export type QuoteError = {
  /**
   * The provider ID that failed.
   */
  provider: string;
  /**
   * Error message.
   */
  error?: string;
};

/**
 * Sort order information for quotes.
 */
export type QuoteSortOrder = {
  /**
   * The sort criteria.
   */
  sortBy: QuoteSortBy;
  /**
   * Provider IDs in sorted order.
   */
  ids: string[];
};

/**
 * Custom action for a provider (e.g., Apple Pay).
 */
export type QuoteCustomAction = {
  /**
   * Buy action details.
   */
  buy: {
    /**
     * Provider ID.
     */
    providerId: string;
  };
  /**
   * Payment method ID this action applies to.
   */
  paymentMethodId: string;
  /**
   * Supported payment method IDs.
   */
  supportedPaymentMethodIds: string[];
};

/**
 * Response from the quotes API.
 */
export type QuotesResponse = {
  /**
   * Successfully retrieved quotes.
   */
  success: Quote[];
  /**
   * Sort orders for the quotes.
   */
  sorted: QuoteSortOrder[];
  /**
   * Errors from providers that failed to return quotes.
   */
  error: QuoteError[];
  /**
   * Custom actions available from providers.
   */
  customActions: QuoteCustomAction[];
};

/**
 * Parameters for fetching quotes.
 */
export type GetQuotesParams = {
  /**
   * The region code (e.g., "us", "us-ca").
   */
  region: string;
  /**
   * Array of payment method IDs to get quotes for.
   */
  paymentMethods: string[];
  /**
   * The CAIP-19 asset ID (e.g., "eip155:1/erc20:0x...").
   */
  assetId: string;
  /**
   * The fiat currency code (e.g., "usd").
   */
  fiat: string;
  /**
   * The amount (in fiat for buy, crypto for sell).
   */
  amount: number;
  /**
   * The destination wallet address.
   */
  walletAddress: string;
  /**
   * Optional redirect URL after order completion.
   */
  redirectUrl?: string;
  /**
   * Optional provider IDs to filter quotes.
   */
  providers?: string[];
  /**
   * The ramp action type. Defaults to 'buy'.
   */
  action?: RampAction;
};

/**
 * Represents a country returned from the regions/countries API.
 */
export type Country = {
  /**
   * ISO-2 country code (e.g., "US", "GB").
   */
  isoCode: string;
  /**
   * Country identifier. Can be in path format (e.g., "/regions/us") or ISO code format.
   * If not provided, defaults to isoCode.
   */
  id?: string;
  /**
   * Country flag emoji or code.
   */
  flag: string;
  /**
   * Country name.
   */
  name: string;
  /**
   * Phone number information.
   */
  phone: CountryPhone;
  /**
   * Default currency code.
   */
  currency: string;
  /**
   * Whether this country is supported for buy and/or sell ramp actions.
   */
  supported: SupportedActions;
  /**
   * Whether this country is recommended.
   */
  recommended?: boolean;
  /**
   * Array of state objects.
   */
  states?: State[];
  /**
   * Default amount for ramps transactions.
   */
  defaultAmount?: number;
  /**
   * Quick amount options for ramps transactions.
   */
  quickAmounts?: number[];
};

/**
 * Represents a token returned from the regions/{region}/tokens API.
 */
export type RampsToken = {
  /**
   * The asset identifier in CAIP-19 format (e.g., "eip155:1/erc20:0x...").
   */
  assetId: string;
  /**
   * The chain identifier in CAIP-2 format (e.g., "eip155:1").
   */
  chainId: string;
  /**
   * Token name (e.g., "USD Coin").
   */
  name: string;
  /**
   * Token symbol (e.g., "USDC").
   */
  symbol: string;
  /**
   * Number of decimals for the token.
   */
  decimals: number;
  /**
   * URL to the token icon.
   */
  iconUrl: string;
  /**
   * Whether this token is supported.
   */
  tokenSupported: boolean;
};

/**
 * Response from the regions/{region}/tokens API.
 */
export type TokensResponse = {
  /**
   * Top/popular tokens for the region.
   */
  topTokens: RampsToken[];
  /**
   * All available tokens for the region.
   */
  allTokens: RampsToken[];
};

// === ORDER TYPES ===

/**
 * Possible statuses for a ramps order.
 */
export enum RampsOrderStatus {
  Unknown = 'UNKNOWN',
  Precreated = 'PRECREATED',
  Created = 'CREATED',
  Pending = 'PENDING',
  Failed = 'FAILED',
  Completed = 'COMPLETED',
  Cancelled = 'CANCELLED',
  IdExpired = 'ID_EXPIRED',
}

/**
 * Network information associated with an order.
 */
export type RampsOrderNetwork = {
  name: string;
  chainId: string;
};

/**
 * Crypto currency information associated with an order.
 */
export type RampsOrderCryptoCurrency = {
  assetId?: string;
  name?: string;
  chainId?: string;
  decimals?: number;
  iconUrl?: string;
  symbol: string;
};

/**
 * Payment method information associated with an order.
 */
export type RampsOrderPaymentMethod = {
  id: string;
  name?: string;
  shortName?: string;
  duration?: string;
  icon?: string;
  isManualBankTransfer?: boolean;
};

/**
 * Fiat currency information associated with an order.
 */
export type RampsOrderFiatCurrency = {
  id?: string;
  symbol: string;
  name?: string;
  decimals?: number;
  denomSymbol?: string;
};

/**
 * A unified order type returned from the V2 API.
 * The V2 endpoint normalizes all provider responses into this shape.
 */
export type RampsOrder = {
  id?: string;
  isOnlyLink: boolean;
  provider?: Provider;
  success: boolean;
  cryptoAmount: string | number;
  fiatAmount: number;
  cryptoCurrency?: RampsOrderCryptoCurrency;
  fiatCurrency?: RampsOrderFiatCurrency;
  providerOrderId: string;
  providerOrderLink: string;
  createdAt: number;
  paymentMethod?: RampsOrderPaymentMethod;
  totalFeesFiat: number;
  txHash: string;
  walletAddress: string;
  status: RampsOrderStatus;
  network: RampsOrderNetwork;
  canBeUpdated: boolean;
  idHasExpired: boolean;
  idExpirationDate?: number;
  excludeFromPurchases: boolean;
  timeDescriptionPending: string;
  fiatAmountInUsd?: number;
  feesInUsd?: number;
  region?: string;
  orderType: string;
  exchangeRate?: number;
  pollingSecondsMinimum?: number;
  statusDescription?: string;
  partnerFees?: number;
  networkFees?: number;
};

/**
 * The SDK version to send with API requests. (backwards-compatibility)
 */
export const RAMPS_SDK_VERSION = '2.1.6';

/**
 * The type of ramp action: 'buy' or 'sell'.
 */
export type RampAction = 'buy' | 'sell';

// === GENERAL ===

/**
 * The name of the {@link RampsService}, used to namespace the
 * service's actions and events.
 */
export const serviceName = 'RampsService';

/**
 * The environment to use for API requests.
 */
export enum RampsEnvironment {
  Production = 'production',
  Staging = 'staging',
  Development = 'development',
  Local = 'local',
}

/**
 * The type of ramps API service.
 * Determines which base URL to use (cache vs standard).
 */
export enum RampsApiService {
  Regions = 'regions',
  Orders = 'orders',
}

// === MESSENGER ===

const MESSENGER_EXPOSED_METHODS = [
  'getGeolocation',
  'getCountries',
  'getTokens',
  'getProviders',
  'getPaymentMethods',
  'getQuotes',
  'getBuyWidgetUrl',
  'getOrder',
  'getOrderFromCallback',
] as const;

/**
 * Actions that {@link RampsService} exposes to other consumers.
 */
export type RampsServiceActions = RampsServiceMethodActions;

/**
 * Actions from other messengers that {@link RampsService} calls.
 */
type AllowedActions = never;

/**
 * Events that {@link RampsService} exposes to other consumers.
 */
export type RampsServiceEvents = never;

/**
 * Events from other messengers that {@link RampsService} subscribes to.
 */
type AllowedEvents = never;

/**
 * The messenger which is restricted to actions and events accessed by
 * {@link RampsService}.
 */
export type RampsServiceMessenger = Messenger<
  typeof serviceName,
  RampsServiceActions | AllowedActions,
  RampsServiceEvents | AllowedEvents
>;

// === SERVICE DEFINITION ===

/**
 * Gets the base URL for API requests based on the environment and service type.
 * The Regions service uses a cache URL, while other services use the standard URL.
 *
 * @param environment - The environment to use.
 * @param service - The API service type (determines if cache URL is used).
 * @returns The base URL for API requests.
 */
function getBaseUrl(
  environment: RampsEnvironment,
  service: RampsApiService,
): string {
  const cache = service === RampsApiService.Regions ? '-cache' : '';

  switch (environment) {
    case RampsEnvironment.Production:
      return `https://on-ramp${cache}.api.cx.metamask.io`;
    case RampsEnvironment.Staging:
    case RampsEnvironment.Development:
      return `https://on-ramp${cache}.uat-api.cx.metamask.io`;
    case RampsEnvironment.Local:
      return 'http://localhost:3000';
    default:
      throw new Error(`Invalid environment: ${String(environment)}`);
  }
}

/**
 * Constructs an API path with a version prefix.
 *
 * @param path - The API endpoint path.
 * @param version - The API version prefix. Defaults to 'v2'.
 * @returns The versioned API path.
 */
function getApiPath(path: string, version: string = 'v2'): string {
  return `${version}/${path}`;
}

/**
 * This service object is responsible for interacting with the Ramps API.
 *
 * @example
 *
 * ``` ts
 * import { Messenger } from '@metamask/messenger';
 * import type {
 *   RampsServiceActions,
 *   RampsServiceEvents,
 * } from '@metamask/ramps-controller';
 *
 * const rootMessenger = new Messenger<
 *   'Root',
 *   RampsServiceActions
 *   RampsServiceEvents
 * >({ namespace: 'Root' });
 * const rampsServiceMessenger = new Messenger<
 *   'RampsService',
 *   RampsServiceActions,
 *   RampsServiceEvents,
 *   typeof rootMessenger,
 * >({
 *   namespace: 'RampsService',
 *   parent: rootMessenger,
 * });
 * // Instantiate the service to register its actions on the messenger
 * new RampsService({
 *   messenger: rampsServiceMessenger,
 *   environment: RampsEnvironment.Production,
 *   context: 'mobile-ios',
 *   fetch,
 * });
 *
 * // Later...
 * // Get the user's geolocation
 * const geolocation = await rootMessenger.call(
 *   'RampsService:getGeolocation',
 * );
 * // ... Do something with the geolocation ...
 * ```
 */
export class RampsService {
  /**
   * The name of the service.
   */
  readonly name: typeof serviceName;

  /**
   * The messenger suited for this service.
   */
  readonly #messenger: ConstructorParameters<
    typeof RampsService
  >[0]['messenger'];

  /**
   * A function that can be used to make an HTTP request.
   */
  readonly #fetch: ConstructorParameters<typeof RampsService>[0]['fetch'];

  /**
   * The policy that wraps the request.
   *
   * @see {@link createServicePolicy}
   */
  readonly #policy: ServicePolicy;

  /**
   * The environment used for API requests.
   */
  readonly #environment: RampsEnvironment;

  /**
   * The context for API requests (e.g., 'mobile-ios', 'mobile-android').
   */
  readonly #context: string;

  /**
   * Optional base URL override for local development.
   */
  readonly #baseUrlOverride?: string;

  /**
   * Constructs a new RampsService object.
   *
   * @param args - The constructor arguments.
   * @param args.messenger - The messenger suited for this service.
   * @param args.environment - The environment to use for API requests.
   * @param args.context - The context for API requests (e.g., 'mobile-ios', 'mobile-android').
   * @param args.fetch - A function that can be used to make an HTTP request. If
   * your JavaScript environment supports `fetch` natively, you'll probably want
   * to pass that; otherwise you can pass an equivalent (such as `fetch` via
   * `node-fetch`).
   * @param args.policyOptions - Options to pass to `createServicePolicy`, which
   * is used to wrap each request. See {@link CreateServicePolicyOptions}.
   * @param args.baseUrlOverride - Optional base URL override for local development.
   */
  constructor({
    messenger,
    environment = RampsEnvironment.Staging,
    context,
    fetch: fetchFunction,
    policyOptions = {},
    baseUrlOverride,
  }: {
    messenger: RampsServiceMessenger;
    environment?: RampsEnvironment;
    context: string;
    fetch: typeof fetch;
    policyOptions?: CreateServicePolicyOptions;
    baseUrlOverride?: string;
  }) {
    this.name = serviceName;
    this.#messenger = messenger;
    this.#fetch = fetchFunction;
    this.#policy = createServicePolicy(policyOptions);
    this.#environment = environment;
    this.#context = context;
    this.#baseUrlOverride = baseUrlOverride;

    this.#messenger.registerMethodActionHandlers(
      this,
      MESSENGER_EXPOSED_METHODS,
    );
  }

  /**
   * Gets the base URL for API requests, respecting the baseUrlOverride if set.
   *
   * @param service - The API service type.
   * @returns The base URL to use.
   */
  #getBaseUrl(service: RampsApiService): string {
    if (this.#baseUrlOverride) {
      return this.#baseUrlOverride;
    }
    return getBaseUrl(this.#environment, service);
  }

  /**
   * Registers a handler that will be called after a request returns a non-500
   * response, causing a retry. Primarily useful in tests where timers are being
   * mocked.
   *
   * @param listener - The handler to be called.
   * @returns An object that can be used to unregister the handler. See
   * {@link CockatielEvent}.
   * @see {@link createServicePolicy}
   */
  onRetry(
    listener: Parameters<ServicePolicy['onRetry']>[0],
  ): ReturnType<ServicePolicy['onRetry']> {
    return this.#policy.onRetry(listener);
  }

  /**
   * Registers a handler that will be called after a set number of retry rounds
   * prove that requests to the API endpoint consistently return a 5xx response.
   *
   * @param listener - The handler to be called.
   * @returns An object that can be used to unregister the handler. See
   * {@link CockatielEvent}.
   * @see {@link createServicePolicy}
   */
  onBreak(
    listener: Parameters<ServicePolicy['onBreak']>[0],
  ): ReturnType<ServicePolicy['onBreak']> {
    return this.#policy.onBreak(listener);
  }

  /**
   * Registers a handler that will be called under one of two circumstances:
   *
   * 1. After a set number of retries prove that requests to the API
   * consistently result in one of the following failures:
   *    1. A connection initiation error
   *    2. A connection reset error
   *    3. A timeout error
   *    4. A non-JSON response
   *    5. A 502, 503, or 504 response
   * 2. After a successful request is made to the API, but the response takes
   * longer than a set duration to return.
   *
   * @param listener - The handler to be called.
   * @returns An object that can be used to unregister the handler. See
   * {@link CockatielEvent}.
   */
  onDegraded(
    listener: Parameters<ServicePolicy['onDegraded']>[0],
  ): ReturnType<ServicePolicy['onDegraded']> {
    return this.#policy.onDegraded(listener);
  }

  /**
   * Adds common request parameters to a URL.
   *
   * @param url - The URL to add parameters to.
   * @param action - The ramp action type (optional, not all endpoints require it).
   */
  #addCommonParams(url: URL, action?: RampAction): void {
    if (action) {
      url.searchParams.set('action', action);
    }
    url.searchParams.set('sdk', RAMPS_SDK_VERSION);
    url.searchParams.set('controller', packageJson.version);
    url.searchParams.set('context', this.#context);
  }

  /**
   * Makes an API request with retry policy and error handling.
   *
   * @param service - The API service type (determines base URL).
   * @param path - The endpoint path.
   * @param options - Request options.
   * @param options.action - The ramp action type (optional).
   * @param options.responseType - How to parse the response ('json' or 'text').
   * @returns The parsed response data.
   */
  async #request<TResponse>(
    service: RampsApiService,
    path: string,
    options: {
      action?: RampAction;
      responseType: 'json' | 'text';
    },
  ): Promise<TResponse> {
    return this.#policy.execute(async () => {
      const baseUrl = this.#getBaseUrl(service);
      const url = new URL(path, baseUrl);
      this.#addCommonParams(url, options.action);

      const response = await this.#fetch(url);
      if (!response.ok) {
        throw new HttpError(
          response.status,
          `Fetching '${url.toString()}' failed with status '${response.status}'`,
        );
      }

      return options.responseType === 'json'
        ? (response.json() as Promise<TResponse>)
        : (response.text() as Promise<TResponse>);
    });
  }

  /**
   * Makes a request to the API in order to retrieve the user's geolocation
   * based on their IP address.
   *
   * @returns The user's country/region code (e.g., "US-UT" for Utah, USA).
   */
  async getGeolocation(): Promise<string> {
    const textResponse = await this.#request<string>(
      RampsApiService.Orders,
      'geolocation',
      { responseType: 'text' },
    );

    const trimmedResponse = textResponse.trim();
    if (trimmedResponse.length > 0) {
      return trimmedResponse;
    }

    throw new Error('Malformed response received from geolocation API');
  }

  /**
   * Makes a request to the cached API to retrieve the list of supported countries.
   * The API returns countries with support information for both buy and sell actions.
   * Filters countries based on aggregator support (preserves OnRampSDK logic).
   *
   * @returns An array of countries filtered by aggregator support.
   */
  async getCountries(): Promise<Country[]> {
    const countries = await this.#request<Country[]>(
      RampsApiService.Regions,
      getApiPath('regions/countries'),
      { responseType: 'json' },
    );

    if (!Array.isArray(countries)) {
      throw new Error('Malformed response received from countries API');
    }

    return countries.filter((country) => {
      const isCountrySupported =
        country.supported.buy || country.supported.sell;

      if (country.states && country.states.length > 0) {
        const hasSupportedState = country.states.some(
          // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing -- intentionally using || to treat false as unsupported
          (state) => state.supported?.buy || state.supported?.sell,
        );
        return isCountrySupported || hasSupportedState;
      }

      return isCountrySupported;
    });
  }

  /**
   * Fetches the list of available tokens for a given region and action.
   * Supports optional provider filter.
   *
   * @param region - The region code (e.g., "us", "fr", "us-ny").
   * @param action - The ramp action type ('buy' or 'sell').
   * @param options - Optional query parameters for filtering tokens.
   * @param options.provider - Provider ID(s) to filter by.
   * @returns The tokens response containing topTokens and allTokens.
   */
  async getTokens(
    region: string,
    action: RampAction = 'buy',
    options?: {
      provider?: string | string[];
    },
  ): Promise<TokensResponse> {
    const normalizedRegion = region.toLowerCase().trim();
    const url = new URL(
      getApiPath(`regions/${normalizedRegion}/topTokens`),
      this.#getBaseUrl(RampsApiService.Regions),
    );
    this.#addCommonParams(url, action);

    if (options?.provider) {
      const providerIds = Array.isArray(options.provider)
        ? options.provider
        : [options.provider];
      providerIds.forEach((id) => url.searchParams.append('provider', id));
    }

    const response = await this.#policy.execute(async () => {
      const fetchResponse = await this.#fetch(url);
      if (!fetchResponse.ok) {
        throw new HttpError(
          fetchResponse.status,
          `Fetching '${url.toString()}' failed with status '${fetchResponse.status}'`,
        );
      }
      return fetchResponse.json() as Promise<TokensResponse>;
    });

    if (!response || typeof response !== 'object') {
      throw new Error('Malformed response received from tokens API');
    }

    if (
      !Array.isArray(response.topTokens) ||
      !Array.isArray(response.allTokens)
    ) {
      throw new Error('Malformed response received from tokens API');
    }

    return response;
  }

  /**
   * Fetches the list of providers for a given region.
   * Supports optional query filters: provider, crypto, fiat, payments.
   *
   * @param regionCode - The region code (e.g., "us", "fr", "us-ny").
   * @param options - Optional query parameters for filtering providers.
   * @param options.provider - Provider ID(s) to filter by.
   * @param options.crypto - Crypto currency ID(s) to filter by.
   * @param options.fiat - Fiat currency ID(s) to filter by.
   * @param options.payments - Payment method ID(s) to filter by.
   * @returns The providers response containing providers array.
   */
  async getProviders(
    regionCode: string,
    options?: {
      provider?: string | string[];
      crypto?: string | string[];
      fiat?: string | string[];
      payments?: string | string[];
    },
  ): Promise<{ providers: Provider[] }> {
    const normalizedRegion = regionCode.toLowerCase().trim();
    const url = new URL(
      getApiPath(`regions/${normalizedRegion}/providers`),
      this.#getBaseUrl(RampsApiService.Regions),
    );
    this.#addCommonParams(url);

    if (options?.provider) {
      const providerIds = Array.isArray(options.provider)
        ? options.provider
        : [options.provider];
      providerIds.forEach((id) => url.searchParams.append('provider', id));
    }

    if (options?.crypto) {
      const cryptoIds = Array.isArray(options.crypto)
        ? options.crypto
        : [options.crypto];
      cryptoIds.forEach((id) => url.searchParams.append('crypto', id));
    }

    if (options?.fiat) {
      const fiatIds = Array.isArray(options.fiat)
        ? options.fiat
        : [options.fiat];
      fiatIds.forEach((id) => url.searchParams.append('fiat', id));
    }

    if (options?.payments) {
      const paymentIds = Array.isArray(options.payments)
        ? options.payments
        : [options.payments];
      paymentIds.forEach((id) => url.searchParams.append('payments', id));
    }

    const response = await this.#policy.execute(async () => {
      const fetchResponse = await this.#fetch(url);
      if (!fetchResponse.ok) {
        throw new HttpError(
          fetchResponse.status,
          `Fetching '${url.toString()}' failed with status '${fetchResponse.status}'`,
        );
      }
      return fetchResponse.json() as Promise<{ providers: Provider[] }>;
    });

    if (!response || typeof response !== 'object') {
      throw new Error('Malformed response received from providers API');
    }

    if (!Array.isArray(response.providers)) {
      throw new Error('Malformed response received from providers API');
    }

    return response;
  }

  /**
   * Fetches the list of payment methods for a given region, asset, and provider.
   *
   * @param options - Query parameters for filtering payment methods.
   * @param options.region - User's region code (e.g., "us-al").
   * @param options.fiat - Fiat currency code (e.g., "usd").
   * @param options.assetId - CAIP-19 cryptocurrency identifier.
   * @param options.provider - Provider ID path.
   * @returns The payment methods response containing payments array.
   */
  async getPaymentMethods(options: {
    region: string;
    fiat: string;
    assetId: string;
    provider: string;
  }): Promise<PaymentMethodsResponse> {
    const normalizedRegion = options.region.toLowerCase().trim();
    const url = new URL(
      getApiPath(`regions/${normalizedRegion}/payments`),
      this.#getBaseUrl(RampsApiService.Regions),
    );
    this.#addCommonParams(url);

    url.searchParams.set('region', options.region.toLowerCase().trim());
    url.searchParams.set('fiat', options.fiat.toLowerCase().trim());
    url.searchParams.set('crypto', options.assetId);
    url.searchParams.set('provider', options.provider);

    const response = await this.#policy.execute(async () => {
      const fetchResponse = await this.#fetch(url);
      if (!fetchResponse.ok) {
        throw new HttpError(
          fetchResponse.status,
          `Fetching '${url.toString()}' failed with status '${fetchResponse.status}'`,
        );
      }
      return fetchResponse.json() as Promise<PaymentMethodsResponse>;
    });

    if (!response || typeof response !== 'object') {
      throw new Error('Malformed response received from paymentMethods API');
    }

    if (!Array.isArray(response.payments)) {
      throw new Error('Malformed response received from paymentMethods API');
    }

    return response;
  }

  /**
   * Fetches quotes from all providers for a given set of parameters.
   * Uses the V2 orders API to get quotes for multiple payment methods at once.
   *
   * @param params - The parameters for fetching quotes.
   * @param params.region - User's region code (e.g., "us", "us-ca").
   * @param params.paymentMethods - Array of payment method IDs.
   * @param params.assetId - CAIP-19 cryptocurrency identifier.
   * @param params.fiat - Fiat currency code (e.g., "usd").
   * @param params.amount - The amount (in fiat for buy, crypto for sell).
   * @param params.walletAddress - The destination wallet address.
   * @param params.redirectUrl - Optional redirect URL after order completion.
   * @param params.providers - Optional provider IDs to filter quotes.
   * @param params.action - The ramp action type. Defaults to 'buy'.
   * @returns The quotes response containing success, sorted, error, and customActions.
   */
  async getQuotes(params: GetQuotesParams): Promise<QuotesResponse> {
    const normalizedRegion = params.region.toLowerCase().trim();
    const normalizedFiat = params.fiat.toLowerCase().trim();
    const action = params.action ?? 'buy';

    const url = new URL(
      getApiPath('quotes'),
      getBaseUrl(this.#environment, RampsApiService.Orders),
    );
    this.#addCommonParams(url, action);

    // Build region ID in the format expected by the API
    url.searchParams.set('region', normalizedRegion);
    url.searchParams.set('fiat', normalizedFiat);
    url.searchParams.set('crypto', params.assetId);
    url.searchParams.set('amount', String(params.amount));
    url.searchParams.set('walletAddress', params.walletAddress);

    // Add payment methods as array parameters
    params.paymentMethods.forEach((paymentMethod) => {
      url.searchParams.append('payments', paymentMethod);
    });

    // Add provider filter if specified
    params.providers?.forEach((provider) => {
      url.searchParams.append('providers', provider);
    });

    // Add redirect URL if specified
    if (params.redirectUrl) {
      url.searchParams.set('redirectUrl', params.redirectUrl);
    }

    const response = await this.#policy.execute(async () => {
      const fetchResponse = await this.#fetch(url);
      if (!fetchResponse.ok) {
        throw new HttpError(
          fetchResponse.status,
          `Fetching '${url.toString()}' failed with status '${fetchResponse.status}'`,
        );
      }
      return fetchResponse.json() as Promise<QuotesResponse>;
    });

    if (!response || typeof response !== 'object') {
      throw new Error('Malformed response received from quotes API');
    }

    if (
      !Array.isArray(response.success) ||
      !Array.isArray(response.sorted) ||
      !Array.isArray(response.error) ||
      !Array.isArray(response.customActions)
    ) {
      throw new Error('Malformed response received from quotes API');
    }

    return response;
  }

  /**
   * Fetches the buy widget data from a buy URL endpoint.
   * Makes a request to the buyURL (as provided in a quote) to get the actual
   * provider widget URL, browser type, and order ID.
   *
   * @param buyUrl - The full buy URL endpoint to fetch from.
   * @returns The buy widget data containing the provider widget URL.
   */
  async getBuyWidgetUrl(buyUrl: string): Promise<BuyWidget> {
    const url = new URL(buyUrl);
    this.#addCommonParams(url);

    const response = await this.#policy.execute(async () => {
      const fetchResponse = await this.#fetch(url);
      if (!fetchResponse.ok) {
        throw new HttpError(
          fetchResponse.status,
          `Fetching '${url.toString()}' failed with status '${fetchResponse.status}'`,
        );
      }
      return fetchResponse.json() as Promise<BuyWidget>;
    });

    if (!response || typeof response !== 'object' || !response.url) {
      throw new Error('Malformed response received from buy widget URL API');
    }

    return response;
  }

  /**
   * Fetches an order from the unified V2 API endpoint.
   * This endpoint returns a normalized `RampsOrder` (DepositOrder shape)
   * for all provider types, including both aggregator and native providers.
   *
   * @param providerCode - The provider code (e.g., "transak", "transak-native", "moonpay").
   * @param orderCode - The order identifier.
   * @param wallet - The wallet address associated with the order.
   * @returns The unified order data.
   */
  async getOrder(
    providerCode: string,
    orderCode: string,
    wallet: string,
  ): Promise<RampsOrder> {
    const url = new URL(
      getApiPath(`providers/${providerCode}/orders/${orderCode}`),
      this.#getBaseUrl(RampsApiService.Orders),
    );
    this.#addCommonParams(url);
    url.searchParams.set('wallet', wallet);

    const response = await this.#policy.execute(async () => {
      const fetchResponse = await this.#fetch(url);
      if (!fetchResponse.ok) {
        throw new HttpError(
          fetchResponse.status,
          `Fetching '${url.toString()}' failed with status '${fetchResponse.status}'`,
        );
      }
      return fetchResponse.json() as Promise<RampsOrder>;
    });

    if (!response || typeof response !== 'object') {
      throw new Error('Malformed response received from order API');
    }

    return response;
  }

  /**
   * Extracts an order from a provider callback URL.
   * Sends the callback URL to the V2 API backend, which knows how to parse
   * each provider's callback format and extract the order ID. Then fetches
   * the full order using that ID.
   *
   * This is the V2 equivalent of the aggregator SDK's `getOrderFromCallback`.
   *
   * @param providerCode - The provider code (e.g., "transak", "moonpay").
   * @param callbackUrl - The full callback URL the provider redirected to.
   * @param wallet - The wallet address associated with the order.
   * @returns The unified order data.
   */
  async getOrderFromCallback(
    providerCode: string,
    callbackUrl: string,
    wallet: string,
  ): Promise<RampsOrder> {
    // Step 1: Send the callback URL to the backend to extract the order ID.
    // The backend parses it using provider-specific logic.
    const callbackApiUrl = new URL(
      getApiPath(`providers/${providerCode}/callback`),
      this.#getBaseUrl(RampsApiService.Orders),
    );
    this.#addCommonParams(callbackApiUrl);
    callbackApiUrl.searchParams.set('url', callbackUrl);

    const callbackResponse = await this.#policy.execute(async () => {
      const fetchResponse = await this.#fetch(callbackApiUrl);
      if (!fetchResponse.ok) {
        throw new HttpError(
          fetchResponse.status,
          `Fetching '${callbackApiUrl.toString()}' failed with status '${fetchResponse.status}'`,
        );
      }
      return fetchResponse.json() as Promise<{ id: string }>;
    });

    const rawOrderId = callbackResponse?.id;
    if (!rawOrderId) {
      throw new Error(
        'Could not extract order ID from callback URL via provider',
      );
    }

    // The callback response id may be a full resource path like
    // "/providers/transak-staging/orders/3ec2e8ac-...".
    // Extract just the order code (last segment) so getOrder doesn't
    // build a doubled path.
    const lastSlash = rawOrderId.lastIndexOf('/');
    const orderCode =
      lastSlash >= 0 ? rawOrderId.slice(lastSlash + 1) : rawOrderId;

    // Step 2: Fetch the full order using the extracted order code.
    return this.getOrder(providerCode, orderCode, wallet);
  }
}
