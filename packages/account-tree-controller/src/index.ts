export type { AccountWalletObject } from './wallet.js';
export type { AccountGroupObject } from './group.js';
export { isAccountGroupNameUnique } from './group.js';

export {
  USER_STORAGE_GROUPS_FEATURE_KEY,
  USER_STORAGE_WALLETS_FEATURE_KEY,
} from './backup-and-sync/user-storage/constants.js';

export type {
  AccountTreeControllerState,
  AccountTreeControllerGetStateAction,
  AccountTreeControllerActions,
  AccountTreeControllerStateChangeEvent,
  AccountTreeControllerAccountTreeChangeEvent,
  AccountTreeControllerSelectedAccountGroupChangeEvent,
  AccountTreeControllerAccountGroupCreatedEvent,
  AccountTreeControllerAccountGroupUpdatedEvent,
  AccountTreeControllerAccountGroupRemovedEvent,
  AccountTreeControllerEvents,
  AccountTreeControllerMessenger,
} from './types.js';

export type {
  AccountTreeControllerGetAccountWalletObjectAction,
  AccountTreeControllerGetAccountWalletObjectsAction,
  AccountTreeControllerGetAccountsFromSelectedAccountGroupAction,
  AccountTreeControllerGetAccountGroupObjectAction,
  AccountTreeControllerGetAccountContextAction,
  AccountTreeControllerGetSelectedAccountGroupAction,
  AccountTreeControllerSetSelectedAccountGroupAction,
  AccountTreeControllerSetAccountGroupNameAction,
  AccountTreeControllerSetAccountWalletNameAction,
  AccountTreeControllerSetAccountGroupPinnedAction,
  AccountTreeControllerSetAccountGroupHiddenAction,
  AccountTreeControllerClearStateAction,
  AccountTreeControllerSyncWithUserStorageAction,
  AccountTreeControllerSyncWithUserStorageAtLeastOnceAction,
  AccountTreeControllerInitAction,
  AccountTreeControllerReinitAction,
} from './AccountTreeController-method-action-types.js';

export type { AccountContext } from './AccountTreeController.js';

export {
  AccountTreeController,
  getDefaultAccountTreeControllerState,
} from './AccountTreeController.js';
