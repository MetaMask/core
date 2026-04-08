import type {
  AccountTreeControllerGetAccountsFromSelectedAccountGroupAction,
  AccountTreeControllerSelectedAccountGroupChangeEvent,
} from '@metamask/account-tree-controller';
import type { GeolocationControllerGetGeolocationAction } from '@metamask/geolocation-controller';
import type {
  KeyringControllerGetStateAction,
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

/**
 * Action to track a MetaMetrics event. Locally declared because
 * `MetaMetricsController` is host-app specific (extension and mobile each
 * ship their own implementation) and there is no shared core package for
 * it to import from. The payload shape is kept intentionally loose so
 * host apps can forward any metrics payload without being re-typed here.
 *
 * The PerpsController itself never calls this action directly — metrics
 * flow through the injected `PerpsPlatformDependencies.metrics` adapter.
 * The type only exists in the allowed-actions union so host-app messengers
 * that register `MetaMetricsController:trackEvent` assign cleanly to
 * `PerpsControllerMessenger` without requiring a cast.
 */
export type MetaMetricsControllerTrackEventAction = {
  type: 'MetaMetricsController:trackEvent';
  handler: (payload: {
    event: string;
    category: string;
    properties?: Record<string, unknown>;
    sensitiveProperties?: Record<string, unknown>;
  }) => void;
};

/**
 * Actions from other controllers that PerpsController is allowed to call.
 */
export type PerpsControllerAllowedActions =
  | GeolocationControllerGetGeolocationAction
  | NetworkControllerGetStateAction
  | NetworkControllerGetNetworkClientByIdAction
  | NetworkControllerFindNetworkClientIdByChainIdAction
  | KeyringControllerGetStateAction
  | KeyringControllerSignTypedMessageAction
  | TransactionControllerAddTransactionAction
  | RemoteFeatureFlagControllerGetStateAction
  | AccountTreeControllerGetAccountsFromSelectedAccountGroupAction
  | AuthenticationController.AuthenticationControllerGetBearerTokenAction
  | MetaMetricsControllerTrackEventAction;

/**
 * Events from other controllers that PerpsController is allowed to subscribe to.
 */
export type PerpsControllerAllowedEvents =
  | RemoteFeatureFlagControllerStateChangeEvent
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
