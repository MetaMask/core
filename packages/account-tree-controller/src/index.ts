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
  AccountTreeControllerGetAccountFromSelectedAccountGroupAction,
  AccountTreeControllerGetAccountGroupObjectAction,
  AccountTreeControllerGetAccountContextAction,
  AccountTreeControllerGetSelectedAccountGroupAction,
  AccountTreeControllerSetSelectedAccountGroupAction,
  AccountTreeControllerSetSelectedAccountGroupByAccountIdAction,
  AccountTreeControllerSetAccountGroupNameAction,
  AccountTreeControllerSetAccountWalletNameAction,
  AccountTreeControllerSetAccountGroupPinnedAction,
  AccountTreeControllerSetAccountGroupHiddenAction,
  AccountTreeControllerClearStateAction,
  AccountTreeControllerSyncWithUserStorageAction,
  AccountTreeControllerSyncWithUserStorageAtLeastOnceAction,
  AccountTreeControllerInitAction,
  AccountTreeControllerReinitAction,
  AccountTreeControllerExportStateAction,
  AccountTreeControllerImportStateAction,
} from './AccountTreeController-method-action-types.js';

export type { AccountContext } from './AccountTreeController.js';

export {
  AccountTreeController,
  getDefaultAccountTreeControllerState,
} from './AccountTreeController.js';

export type {
  AccountTreePayload,
  AccountTreePayloadStructType,
  AccountWalletMnemonicPayload,
  AccountWalletPrivateKeyPayload,
  AccountWalletMnemonicGroupEntry,
  AccountWalletPrivateKeyGroupEntry,
  AccountWalletPayloadId,
  AccountGroupPayloadId,
  AccountTreeSnapshotWallet,
  AccountTreeSnapshotGroup,
  ExportStateOptions,
} from './state/payload.js';

export {
  AccountTreePayloadStruct,
  assertValidAccountTreePayload,
  migrate,
  migrations,
} from './state/payload.js';

export type { VersionedState } from '@metamask/keyring-sdk';

export { AccountTreeSnapshot } from './state/snapshot.js';
export { IdMap } from './state/id-map.js';
