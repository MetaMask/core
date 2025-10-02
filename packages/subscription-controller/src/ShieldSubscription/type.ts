import type { RestrictedMessenger } from '@metamask/base-controller';
import type {
  SubscriptionControllerGetSubscriptionsAction,
  SubscriptionControllerStateChangeEvent,
} from 'src/SubscriptionController';
import type { SubscriptionPaymentMethod, SubscriptionStatus } from 'src/types';

import type { shieldSubscriptionControllerName } from './constants';

export type ShieldSubscriptionControllerAction = never;

export type ShieldSubscriptionControllerAllowedActions =
  SubscriptionControllerGetSubscriptionsAction;

export type ShieldSubscriptionControllerEvent = never;

export type ShieldSubscriptionControllerAllowedEvents =
  SubscriptionControllerStateChangeEvent;

export type ShieldSubscriptionControllerMessenger = RestrictedMessenger<
  typeof shieldSubscriptionControllerName,
  | ShieldSubscriptionControllerAction
  | ShieldSubscriptionControllerAllowedActions,
  ShieldSubscriptionControllerEvent | ShieldSubscriptionControllerAllowedEvents,
  ShieldSubscriptionControllerAllowedActions['type'],
  ShieldSubscriptionControllerAllowedEvents['type']
>;

export type ShieldSubscriptionControllerState = {
  id?: string;
  status?: SubscriptionStatus;
  paymentMethod?: SubscriptionPaymentMethod;
};

export type ShieldSubscriptionControllerOptions = {
  messenger: ShieldSubscriptionControllerMessenger;
  state?: Partial<ShieldSubscriptionControllerState>;
  pollingInterval?: number;
};
