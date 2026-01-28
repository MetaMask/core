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
  AccountTreeControllerSetSelectedAccountGroupAction,
  AccountTreeControllerGetSelectedAccountGroupAction,
  AccountTreeControllerGetAccountsFromSelectedAccountGroupAction,
  AccountTreeControllerGetAccountContextAction,
  AccountTreeControllerSetAccountWalletNameAction,
  AccountTreeControllerSetAccountGroupNameAction,
  AccountTreeControllerSetAccountGroupPinnedAction,
  AccountTreeControllerSetAccountGroupHiddenAction,
  AccountTreeControllerStateChangeEvent,
  AccountTreeControllerAccountTreeChangeEvent,
  AccountTreeControllerSelectedAccountGroupChangeEvent,
  AccountTreeControllerEvents,
  AccountTreeControllerMessenger,
} from './types';

export type { AccountContext } from './AccountTreeController';

export {
  AccountTreeController,
  getDefaultAccountTreeControllerState,
} from './AccountTreeController';
