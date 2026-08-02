import type { SubscriptionControllerOptions } from '@metamask/subscription-controller';

/**
 * Per-instance options for the wallet's `SubscriptionController`.
 */
export type SubscriptionControllerInstanceOptions = Omit<
  SubscriptionControllerOptions,
  'messenger' | 'state'
>;
