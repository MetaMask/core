import type {
  IntentOrder,
  IntentSubmissionParams,
  IntentProviderConfig,
  IntentOrderStatus,
} from '../types';

/**
 * Abstract base class for intent providers
 *
 * This class provides the foundation for implementing specific intent providers
 * like CowSwap, 1inch, 0x Protocol, etc. Each provider must implement the
 * abstract methods to handle their specific API and business logic.
 */
export abstract class BaseIntentProvider {
  protected config: IntentProviderConfig;

  constructor(config: IntentProviderConfig) {
    this.config = config;
  }

  /**
   * Get the name of this provider
   */
  abstract getName(): string;

  /**
   * Get the version of this provider
   */
  abstract getVersion(): string;

  /**
   * Get the list of supported chain IDs
   */
  abstract getSupportedChains(): number[];

  /**
   * Submit an order based on the quote and signature
   *
   * @param params - The submission parameters including quote and signature
   * @returns Promise resolving to the created order
   */
  abstract submitOrder(params: IntentSubmissionParams): Promise<IntentOrder>;

  /**
   * Get the current status of an order
   *
   * @param orderId - The order ID to check
   * @param chainId - The chain ID where the order was placed
   * @returns Promise resolving to the order status
   */
  abstract getOrderStatus(
    orderId: string,
    chainId: number,
  ): Promise<IntentOrder>;

  /**
   * Cancel an existing order
   *
   * @param orderId - The order ID to cancel
   * @param chainId - The chain ID where the order was placed
   * @returns Promise resolving to true if cancellation was successful
   */
  abstract cancelOrder(orderId: string, chainId: number): Promise<boolean>;

  /**
   * Lifecycle hook called after an order is submitted
   * Override this method to add provider-specific post-submission logic
   *
   * @param order - The submitted order
   */
  protected async onOrderSubmitted?(order: IntentOrder): Promise<void>;

  /**
   * Lifecycle hook called when an order status changes
   * Override this method to add provider-specific status change logic
   *
   * @param order - The order with updated status
   * @param previousStatus - The previous status of the order
   */
  protected async onOrderStatusChanged?(
    order: IntentOrder,
    previousStatus: IntentOrderStatus,
  ): Promise<void>;

  /**
   * Handle errors in a consistent way across providers
   *
   * @param error - The original error
   * @param context - Context about where the error occurred
   * @returns A new error with provider-specific context
   */
  protected handleError(error: Error, context: string): Error {
    return new Error(`${this.getName()}: ${context} - ${error.message}`);
  }

  /**
   * Get the configuration for this provider
   *
   * @returns The provider configuration
   */
  getConfig(): IntentProviderConfig {
    return { ...this.config };
  }

  /**
   * Check if this provider supports the given chain
   *
   * @param chainId - The chain ID to check
   * @returns True if the chain is supported
   */
  supportsChain(chainId: number): boolean {
    return this.getSupportedChains().includes(chainId);
  }

  /**
   * Check if this provider has a specific feature
   *
   * @param feature - The feature name to check
   * @returns True if the feature is supported
   */
  hasFeature(feature: string): boolean {
    return this.config.features.includes(feature);
  }
}
