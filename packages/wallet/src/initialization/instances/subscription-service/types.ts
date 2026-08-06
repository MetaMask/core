import type { SubscriptionServiceOptions } from '@metamask/subscription-controller';

/**
 * Per-instance options for the wallet's `SubscriptionService`.
 */
export type SubscriptionServiceInstanceOptions = Omit<
  SubscriptionServiceOptions,
  'messenger'
>;
