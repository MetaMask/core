import type { SubscriptionControllerServiceOptions } from '@metamask/subscription-controller';

export type SubscriptionControllerInstanceOptions =
  SubscriptionControllerServiceOptions & {
    pollingInterval?: number;
  };
