/**
 * Backend API Client - Unified Gateway to MetaMask Backend APIs
 *
 * Provides a single entry point for all backend API services with:
 * - Shared authentication (getBearerToken)
 * - Shared client product identification
 * - Messenger integration for controller communication
 *
 * Messenger actions are namespaced as:
 * - BackendApiClient:Accounts:* - Routes to AccountsApiService
 * - BackendApiClient:Token:* - Routes to TokenApiService (token.api.cx.metamask.io)
 * - BackendApiClient:Tokens:* - Routes to TokensApiService (tokens.api.cx.metamask.io)
 * - BackendApiClient:Prices:* - Routes to PriceApiService
 *
 * @example Direct usage:
 * ```typescript
 * const apiClient = new BackendApiClient({
 *   clientProduct: 'metamask-extension',
 *   getBearerToken: async () => authController.getBearerToken(),
 * });
 *
 * const networks = await apiClient.accounts.getV2SupportedNetworks();
 * const trending = await apiClient.token.getV3TrendingTokens({...});
 * const assets = await apiClient.tokens.getV3Assets([...]);
 * const prices = await apiClient.prices.getV1TokenPrices({...});
 * ```
 *
 * @example Messenger-based usage:
 * ```typescript
 * const apiClient = new BackendApiClient({
 *   clientProduct: 'metamask-extension',
 *   getBearerToken: async () => authController.getBearerToken(),
 *   messenger: backendApiMessenger,
 * });
 *
 * // From any controller via messenger
 * const networks = await messenger.call('BackendApiClient:Accounts:getV2SupportedNetworks');
 * const trending = await messenger.call('BackendApiClient:Token:getV3TrendingTokens', options);
 * const assets = await messenger.call('BackendApiClient:Tokens:getV3Assets', assetIds);
 * const prices = await messenger.call('BackendApiClient:Prices:getV1TokenPrices', options);
 * ```
 */

import type { Messenger } from '@metamask/messenger';

import { AccountsApiService, ACCOUNTS_API_METHODS } from './AccountsApiService';
import type { BackendApiClientActions } from './BackendApiClient-action-types';
import { PriceApiService, PRICE_API_METHODS } from './PriceApiService';
import { TokenApiService, TOKEN_API_METHODS } from './TokenApiService';
import { TokensApiService, TOKENS_API_METHODS } from './TokensApiService';
import type { BaseApiServiceOptions } from './types';

const SERVICE_NAME = 'BackendApiClient' as const;

/**
 * Options for BackendApiClient
 */
export type BackendApiClientOptions = BaseApiServiceOptions & {
  /** Optional Messenger for action handler registration */
  messenger?: BackendApiClientMessenger;
};

/**
 * Messenger type for BackendApiClient
 */
export type BackendApiClientMessenger = Messenger<
  typeof SERVICE_NAME,
  BackendApiClientActions,
  never // No events published
>;

/**
 * Service method mapping configuration for registering action handlers
 */
type ServiceMethodMapping<TService, TMethods extends readonly string[]> = {
  service: TService;
  namespace: string;
  methods: TMethods;
};

/**
 * Backend API Client
 *
 * Unified gateway to all MetaMask backend API services.
 * Supports both direct method calls and Messenger-based communication.
 */
export class BackendApiClient {
  readonly name = SERVICE_NAME;

  /** Accounts API Service instance */
  readonly accounts: AccountsApiService;

  /** Token API Service instance (token.api.cx.metamask.io) */
  readonly token: TokenApiService;

  /** Tokens API Service instance (tokens.api.cx.metamask.io) */
  readonly tokens: TokensApiService;

  /** Price API Service instance */
  readonly prices: PriceApiService;

  readonly #messenger?: BackendApiClientMessenger;

  /**
   * Creates a new BackendApiClient instance
   *
   * @param options - Client configuration options
   */
  constructor(options: BackendApiClientOptions = {}) {
    this.#messenger = options.messenger;

    // Extract base options (without messenger) for underlying services
    const serviceOptions: BaseApiServiceOptions = {
      baseUrl: options.baseUrl,
      timeout: options.timeout,
      getBearerToken: options.getBearerToken,
      clientProduct: options.clientProduct,
    };

    // Initialize all API services with shared configuration
    this.accounts = new AccountsApiService(serviceOptions);
    this.token = new TokenApiService(serviceOptions);
    this.tokens = new TokensApiService(serviceOptions);
    this.prices = new PriceApiService(serviceOptions);

    // Register action handlers if messenger is provided
    if (this.#messenger) {
      this.#registerAllActionHandlers();
    }
  }

  /**
   * Register all action handlers for all services
   */
  #registerAllActionHandlers(): void {
    // Define method mappings using exported method arrays from each service
    const accountsMapping: ServiceMethodMapping<
      AccountsApiService,
      typeof ACCOUNTS_API_METHODS
    > = {
      service: this.accounts,
      namespace: 'Accounts',
      methods: ACCOUNTS_API_METHODS,
    };

    const tokenMapping: ServiceMethodMapping<
      TokenApiService,
      typeof TOKEN_API_METHODS
    > = {
      service: this.token,
      namespace: 'Token',
      methods: TOKEN_API_METHODS,
    };

    const tokensMapping: ServiceMethodMapping<
      TokensApiService,
      typeof TOKENS_API_METHODS
    > = {
      service: this.tokens,
      namespace: 'Tokens',
      methods: TOKENS_API_METHODS,
    };

    const pricesMapping: ServiceMethodMapping<
      PriceApiService,
      typeof PRICE_API_METHODS
    > = {
      service: this.prices,
      namespace: 'Prices',
      methods: PRICE_API_METHODS,
    };

    // Register handlers for each service
    this.#registerServiceHandlers(accountsMapping);
    this.#registerServiceHandlers(tokenMapping);
    this.#registerServiceHandlers(tokensMapping);
    this.#registerServiceHandlers(pricesMapping);
  }

  /**
   * Register action handlers for a service
   *
   * @param mapping - Service method mapping configuration
   */
  #registerServiceHandlers<
    TService extends object,
    TMethods extends readonly string[],
  >(mapping: ServiceMethodMapping<TService, TMethods>): void {
    if (!this.#messenger) {
      return;
    }

    for (const methodName of mapping.methods) {
      const actionType =
        `${SERVICE_NAME}:${mapping.namespace}:${methodName}` as BackendApiClientActions['type'];

      // Get the method from the service and bind it
      const method = mapping.service[methodName as keyof TService];
      if (typeof method === 'function') {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const boundMethod = (method as (...args: any[]) => any).bind(
          mapping.service,
        );

        this.#messenger.registerActionHandler(
          actionType,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          async (...args: any[]) => boundMethod(...args),
        );
      }
    }
  }
}

/**
 * Factory function to create a BackendApiClient instance
 *
 * @param options - Client configuration options
 * @returns BackendApiClient instance
 */
export function createBackendApiClient(
  options: BackendApiClientOptions,
): BackendApiClient {
  return new BackendApiClient(options);
}
