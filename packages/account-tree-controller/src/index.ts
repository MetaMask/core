export type { AccountWalletObject } from './wallet';
export type { AccountGroupObject } from './group';
export { isAccountGroupNameUnique } from './group';

export {
  USER_STORAGE_GROUPS_FEATURE_KEY,
  USER_STORAGE_WALLETS_FEATURE_KEY,
} from './backup-and-sync/user-storage/constants';

export type {
  AccountTreeControllerState,
  AccountTreeControllerGetStateAction,
  AccountTreeControllerActions,
  AccountTreeControllerStateChangeEvent,
  AccountTreeControllerAccountTreeChangeEvent,
  AccountTreeControllerSelectedAccountGroupChangeEvent,
  AccountTreeControllerEvents,
  AccountTreeControllerMessenger,
} from './types';

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
} from './AccountTreeController-method-action-types';

export type { AccountContext } from './AccountTreeController';

export {
  AccountTreeController,
  getDefaultAccountTreeControllerState,
} from './AccountTreeController';
