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
import type { SubscriptionControllerGetBenefitsAction } from '@metamask/subscription-controller';
import type { TransactionControllerAddTransactionAction } from '@metamask/transaction-controller';

/**
 * Optional action exposed by clients that own subscription address
 * registration. It is structural because older SubscriptionController
 * versions do not expose it yet; callers fall back to the injected hook.
 */
export type SubscriptionControllerRegisterAddressAction = {
  type: `SubscriptionController:registerAddress`;
  handler: (caipAccountId: string) => Promise<void>;
};

/**
 * Actions from other controllers that PerpsController is allowed to call.
 *
 * `SubscriptionController:getBenefits` is the real action this monorepo's
 * `SubscriptionController` already exposes, imported rather than restated so
 * its signature cannot drift from the controller that serves it. A client that
 * does not register it keeps the injected `subscription` dependency, which
 * {@link RewardsIntegrationService} falls back to.
 */
export type PerpsControllerAllowedActions =
  | SubscriptionControllerGetBenefitsAction
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
