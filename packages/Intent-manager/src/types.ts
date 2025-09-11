/**
 * Intent status enumeration
 */
export enum IntentStatus {
  PENDING = 'pending',
  EXECUTING = 'executing',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
}

/**
 * Intent order status enumeration - more granular than IntentStatus
 */
export enum IntentOrderStatus {
  PENDING = 'pending',
  SUBMITTED = 'submitted',
  CONFIRMED = 'confirmed',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
  EXPIRED = 'expired',
}

/**
 * Fee information for an intent
 */
export type IntentFee = {
  type: 'network' | 'protocol' | 'bridge';
  amount: string;
  token: string;
};

/**
 * Quote response from an intent provider
 */
export type IntentQuote = {
  id: string;
  provider: string;
  srcAmount: string;
  destAmount: string;
  estimatedGas: string;
  estimatedTime: number; // seconds
  priceImpact: number;
  fees: IntentFee[];
  validUntil: number; // timestamp
  metadata: Record<string, unknown>;
};

/**
 * Intent order information
 */
export type IntentOrder = {
  id: string;
  status: IntentOrderStatus;
  txHash?: string;
  createdAt: number;
  updatedAt: number;
  metadata: Record<string, unknown>;
};

/**
 * Parameters for submitting an intent order
 */
export type IntentSubmissionParams = {
  quote: IntentQuote;
  signature: string;
  userAddress: string;
};

/**
 * Configuration for an intent provider
 */
export type IntentProviderConfig = {
  name: string;
  version: string;
  supportedChains: number[];
  apiBaseUrl: string;
  features: string[];
  rateLimit?: {
    requestsPerMinute: number;
    burstLimit: number;
  };
};

/**
 * Registry of intent providers
 */
export type ProviderRegistry = {
  [providerName: string]: BaseIntentProvider;
};

/**
 * Criteria for selecting intent providers
 */
export type ProviderSelectionCriteria = {
  chainId: number;
  tokenPair: [string, string];
  amount: string;
  preferredProviders?: string[];
  excludedProviders?: string[];
};

/**
 * Base interface for intent providers
 */
export type BaseIntentProvider = {
  getName(): string;
  getVersion(): string;
  getSupportedChains(): number[];
  submitOrder(params: IntentSubmissionParams): Promise<IntentOrder>;
  getOrderStatus(orderId: string, chainId: number): Promise<IntentOrder>;
  cancelOrder(orderId: string, chainId: number): Promise<boolean>;
};
