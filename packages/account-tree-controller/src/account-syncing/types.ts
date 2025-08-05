import type {
  AccountGroupMultichainAccountObject,
  AccountTreeGroupPersistedMetadata,
} from 'src/group';
import type { AccountTreeWalletPersistedMetadata } from 'src/wallet';

export type UserStorageSyncedWallet = AccountTreeWalletPersistedMetadata;

export type UserStorageSyncedWalletGroup = AccountTreeGroupPersistedMetadata & {
  groupIndex: AccountGroupMultichainAccountObject['metadata']['entropy']['groupIndex'];
};
