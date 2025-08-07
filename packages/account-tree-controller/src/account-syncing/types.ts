import type {
  AccountGroupType,
  AccountWalletType,
} from '@metamask/account-api';
import type { TraceCallback } from '@metamask/controller-utils';
import type { InternalAccount } from '@metamask/keyring-internal-api';

import type { MultichainAccountSyncingEmitAnalyticsEventParams } from './analytics';
import type { AccountTreeController } from '../AccountTreeController';
import type {
  AccountGroupMultichainAccountObject,
  AccountTreeGroupPersistedMetadata,
} from '../group';
import type { RuleResult } from '../rule';
import type { AccountTreeControllerMessenger } from '../types';
import type { AccountTreeWalletPersistedMetadata } from '../wallet';

export type UserStorageWalletExtendedMetadata = {
  isLegacyAccountSyncingDisabled?: boolean;
};
export type UserStorageSyncedWallet = AccountTreeWalletPersistedMetadata &
  UserStorageWalletExtendedMetadata;

export type UserStorageSyncedWalletGroup = AccountTreeGroupPersistedMetadata & {
  groupIndex: AccountGroupMultichainAccountObject['metadata']['entropy']['groupIndex'];
};

export type AccountSyncingContext = {
  messenger: AccountTreeControllerMessenger;
  controller: AccountTreeController;
  controllerStateUpdateFn: AccountTreeController['update'];
  traceFn: TraceCallback;
  emitAnalyticsEventFn: (
    event: MultichainAccountSyncingEmitAnalyticsEventParams,
  ) => void;
  enableDebugLogging: boolean;
};

export type LegacyAccountSyncingContext = {
  listAccounts: () => InternalAccount[];
  getEntropyRule: () => {
    match: (
      account: InternalAccount,
    ) =>
      | RuleResult<
          AccountWalletType.Entropy,
          AccountGroupType.MultichainAccount
        >
      | undefined;
  };
};
