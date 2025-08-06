import type { AccountTreeController } from 'src/AccountTreeController';
import type {
  AccountGroupMultichainAccountObject,
  AccountTreeGroupPersistedMetadata,
} from 'src/group';
import type { AccountTreeControllerMessenger } from 'src/types';
import type { AccountTreeWalletPersistedMetadata } from 'src/wallet';

export type UserStorageSyncedWallet = AccountTreeWalletPersistedMetadata;

export type UserStorageSyncedWalletGroup = AccountTreeGroupPersistedMetadata & {
  groupIndex: AccountGroupMultichainAccountObject['metadata']['entropy']['groupIndex'];
};

/**
 * Context object containing dependencies for account syncing utilities.
 * This provides a clean interface for utilities to access controller methods and messaging.
 */
export type AccountSyncingContext = {
  messenger: AccountTreeControllerMessenger;
  controller: AccountTreeController;
  controllerStateUpdateFn: AccountTreeController['update'];
};
