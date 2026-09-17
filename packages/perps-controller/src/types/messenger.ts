import type {
  AccountTreeControllerGetAccountsFromSelectedAccountGroupAction,
  AccountTreeControllerSelectedAccountGroupChangeEvent,
} from '@metamask/account-tree-controller';
import type {
  AccountsControllerGetSelectedAccountAction,
  AccountsControllerSelectedAccountChangeEvent,
} from '@metamask/accounts-controller';
import type {
  AuthenticatedUserStorageServiceGetNotificationPreferencesAction,
  AuthenticatedUserStorageServicePutNotificationPreferencesAction,
} from '@metamask/authenticated-user-storage';
import type { GeolocationControllerGetGeolocationAction } from '@metamask/geolocation-controller';
import type {
  KeyringControllerGetStateAction,
  KeyringControllerSignPersonalMessageAction,
  KeyringControllerSignTypedMessageAction,
} from '@metamask/keyring-controller';
import type { Messenger } from '@metamask/messenger';
import type {
  NetworkControllerGetStateAction,
  NetworkControllerGetNetworkClientByIdAction,
  NetworkControllerFindNetworkClientIdByChainIdAction,
} from '@metamask/network-controller';
import type { AuthenticationController } from '@metamask/profile-sync-controller';
import type {
  RemoteFeatureFlagControllerGetStateAction,
  RemoteFeatureFlagControllerStateChangeEvent,
} from '@metamask/remote-feature-flag-controller';
import type { TransactionControllerAddTransactionAction } from '@metamask/transaction-controller';

import type { PerpsSubscriptionBenefits } from './index.js';

/**
 * Read the current profile's subscription benefits.
 *
 * ADR 0064 moves benefits hydration from the plain DI callback onto the
 * messenger. The action is declared structurally rather than imported, because
 * `SubscriptionController` does not live in this monorepo yet; a client that
 * ships it registers an action with this exact name and signature, and a client
 * that does not simply never registers it — {@link RewardsIntegrationService}
 * falls back to the injected `subscription` dependency in that case.
 */
export type SubscriptionControllerGetPerpsBenefitsAction = {
  type: 'SubscriptionController:getPerpsBenefits';
  handler: () => Promise<PerpsSubscriptionBenefits | null>;
};

/**
 * Register a trading address against the current subscription profile.
 *
 * ADR 0064 requires the HyperLiquid trading address to be registered through
 * `AddressIndex` at preview time, so a fill decoded off the HL fan-out can be
 * attributed back to a profile. The address is CAIP-10.
 */
export type SubscriptionControllerRegisterAddressAction = {
  type: 'SubscriptionController:registerAddress';
  handler: (caipAccountId: `${string}:${string}:${string}`) => Promise<void>;
};

/**
 * Actions from other controllers that PerpsController is allowed to call.
 */
export type PerpsControllerAllowedActions =
  | SubscriptionControllerGetPerpsBenefitsAction
  | SubscriptionControllerRegisterAddressAction
  | GeolocationControllerGetGeolocationAction
  | NetworkControllerGetStateAction
  | NetworkControllerGetNetworkClientByIdAction
  | NetworkControllerFindNetworkClientIdByChainIdAction
  | KeyringControllerGetStateAction
  | KeyringControllerSignTypedMessageAction
  | KeyringControllerSignPersonalMessageAction
  | TransactionControllerAddTransactionAction
  | RemoteFeatureFlagControllerGetStateAction
  | AccountsControllerGetSelectedAccountAction
  | AccountTreeControllerGetAccountsFromSelectedAccountGroupAction
  | AuthenticationController.AuthenticationControllerGetBearerTokenAction
  | AuthenticatedUserStorageServiceGetNotificationPreferencesAction
  | AuthenticatedUserStorageServicePutNotificationPreferencesAction;

/**
 * Events from other controllers that PerpsController is allowed to subscribe to.
 */
export type PerpsControllerAllowedEvents =
  | RemoteFeatureFlagControllerStateChangeEvent
  | AccountsControllerSelectedAccountChangeEvent
  | AccountTreeControllerSelectedAccountGroupChangeEvent;

/**
 * The messenger type used by PerpsController and its services.
 * Defined here (rather than in PerpsController.ts) to avoid circular imports
 * between the controller and service files.
 *
 * The first two type parameters (Actions, Events) are filled in by
 * PerpsController.ts when it unions in its own actions/events.
 * Services use this base type directly since they only need the allowed
 * external actions/events.
 */
export type PerpsControllerMessengerBase = Messenger<
  'PerpsController',
  PerpsControllerAllowedActions,
  PerpsControllerAllowedEvents
>;
