import type {
  AccountsControllerGetAccountAction,
  AccountsControllerGetAccountByAddressAction,
  AccountsControllerListMultichainAccountsAction,
} from '@metamask/accounts-controller';
import type { RestrictedMessenger } from '@metamask/base-controller';
import type { KeyringControllerWithKeyringAction } from '@metamask/keyring-controller';
import type { HandleSnapRequest as SnapControllerHandleSnapRequestAction } from '@metamask/snaps-controllers';

/**
 * All actions that {@link MultichainAccountController} registers so that other
 * modules can call them.
 */
export type MultichainAccountControllerActions = never;
/**
 * All events that {@link MultichainAccountController} publishes so that other modules
 * can subscribe to them.
 */
export type MultichainAccountControllerEvents = never;

/**
 * All actions registered by other modules that {@link MultichainAccountController}
 * calls.
 */
export type AllowedActions =
  | AccountsControllerListMultichainAccountsAction
  | AccountsControllerGetAccountAction
  | AccountsControllerGetAccountByAddressAction
  | SnapControllerHandleSnapRequestAction
  | KeyringControllerWithKeyringAction;

/**
 * All events published by other modules that {@link MultichainAccountController}
 * subscribes to.
 */
export type AllowedEvents = never;

/**
 * The messenger restricted to actions and events that
 * {@link MultichainAccountController} needs to access.
 */
export type MultichainAccountControllerMessenger = RestrictedMessenger<
  'MultichainAccountController',
  MultichainAccountControllerActions | AllowedActions,
  MultichainAccountControllerEvents | AllowedEvents,
  AllowedActions['type'],
  AllowedEvents['type']
>;
