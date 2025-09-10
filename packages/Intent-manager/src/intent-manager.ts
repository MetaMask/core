import { DEFAULT_INTENT_MANAGER_CONTROLLER_STATE } from './constants';
import { CowSwapProvider } from './providers/cowswap';
import type {
  BaseIntentProvider,
  IntentOrder,
  IntentQuote,
  IntentQuoteRequest,
  IntentSubmissionParams,
  ProviderSelectionCriteria,
  ProviderRegistry,
} from './types';

/**
 * Intent Manager Controller State
 */
export type IntentManagerState = {
  intents: Record<string, IntentOrder>;
  intentHistory: IntentOrder[];
};

/**
 * Intent Manager Controller
 *
 * Manages the lifecycle of user intents including creation, execution,
 * cancellation, and state tracking. Orchestrates multiple intent providers
 * and provides a unified interface for intent operations.
 */
export class IntentManager {
  private providers: ProviderRegistry = {};

  private defaultProvider?: string;

  private readonly state: IntentManagerState;

  constructor(initialState?: Partial<IntentManagerState>) {
    this.state = {
      ...DEFAULT_INTENT_MANAGER_CONTROLLER_STATE,
      ...initialState,
    };

    this.#initializeProviders();
  }

  /**
   * Initialize default providers
   */
  #initializeProviders(): void {
    // Register CowSwap provider by default
    const cowSwapProvider = new CowSwapProvider();
    this.registerProvider(cowSwapProvider);
  }

  /**
   * Register a new intent provider
   *
   * @param provider - The provider to register
   */
  registerProvider(provider: BaseIntentProvider): void {
    const name = provider.getName();
    this.providers[name] = provider;

    // Set first registered provider as default
    if (!this.defaultProvider) {
      this.defaultProvider = name;
    }
  }

  /**
   * Unregister an intent provider
   *
   * @param providerName - The name of the provider to unregister
   * @returns True if the provider was successfully unregistered
   */
  unregisterProvider(providerName: string): boolean {
    if (this.providers[providerName]) {
      delete this.providers[providerName];

      // Update default if needed
      if (this.defaultProvider === providerName) {
        this.defaultProvider = Object.keys(this.providers)[0];
      }
      return true;
    }
    return false;
  }

  getState(): IntentManagerState {
    return { ...this.state };
  }

  /**
   * Get available providers based on criteria
   *
   * @param criteria - Optional criteria for provider selection
   * @returns Array of available providers
   */
  getAvailableProviders(
    criteria?: ProviderSelectionCriteria,
  ): BaseIntentProvider[] {
    let availableProviders = Object.values(this.providers);

    if (criteria) {
      // Filter by supported chains
      availableProviders = availableProviders.filter((provider) =>
        provider.getSupportedChains().includes(criteria.chainId),
      );

      // Filter by excluded providers
      if (criteria.excludedProviders && criteria.excludedProviders.length > 0) {
        availableProviders = availableProviders.filter(
          (provider) =>
            !criteria.excludedProviders?.includes(provider.getName()),
        );
      }

      // Sort by preferred providers
      if (
        criteria.preferredProviders &&
        criteria.preferredProviders.length > 0
      ) {
        availableProviders.sort((a, b) => {
          const aIndex =
            criteria.preferredProviders?.indexOf(a.getName()) ?? -1;
          const bIndex =
            criteria.preferredProviders?.indexOf(b.getName()) ?? -1;

          if (aIndex === -1 && bIndex === -1) {
            return 0;
          }
          if (aIndex === -1) {
            return 1;
          }
          if (bIndex === -1) {
            return -1;
          }

          return aIndex - bIndex;
        });
      }
    }

    return availableProviders;
  }

  /**
   * Generate quotes from multiple providers
   *
   * @param request - The quote request parameters
   * @param criteria - Optional criteria for provider selection
   * @returns Array of quotes sorted by best rate (highest destAmount)
   */
  async generateQuotes(
    request: IntentQuoteRequest,
    criteria?: ProviderSelectionCriteria,
  ): Promise<IntentQuote[]> {
    const providers = this.getAvailableProviders(criteria);
    const quotes: IntentQuote[] = [];

    await Promise.allSettled(
      providers.map(async (provider) => {
        try {
          const isValid = await provider.validateQuoteRequest(request);
          if (isValid) {
            const quote = await provider.generateQuote(request);
            quotes.push(quote);
          }
        } catch (error) {
          console.warn(
            `Failed to get quote from ${provider.getName()}:`,
            error,
          );
        }
      }),
    );

    // Sort by best rate (highest destination amount)
    return quotes.sort(
      (a, b) => parseFloat(b.destAmount) - parseFloat(a.destAmount),
    );
  }

  async submitIntent(params: IntentSubmissionParams): Promise<IntentOrder> {
    const provider = this.providers[params.quote.provider];
    if (!provider) {
      throw new Error(`Provider ${params.quote.provider} not found`);
    }

    const order = await provider.submitOrder(params);

    // Update state
    this.state.intents[order.id] = order;
    this.state.intentHistory.push(order);

    return order;
  }

  async getOrderStatus(
    orderId: string,
    providerName: string,
    chainId: number,
  ): Promise<IntentOrder> {
    const provider = this.providers[providerName];
    if (!provider) {
      throw new Error(`Provider ${providerName} not found`);
    }

    const order = await provider.getOrderStatus(orderId, chainId);

    // Update state if order exists
    if (this.state.intents[orderId]) {
      this.state.intents[orderId] = order;
    }

    return order;
  }

  async cancelOrder(
    orderId: string,
    providerName: string,
    chainId: number,
  ): Promise<boolean> {
    const provider = this.providers[providerName];
    if (!provider) {
      throw new Error(`Provider ${providerName} not found`);
    }

    return provider.cancelOrder(orderId, chainId);
  }

  getProviders(criteria?: ProviderSelectionCriteria): BaseIntentProvider[] {
    return this.getAvailableProviders(criteria);
  }
}
