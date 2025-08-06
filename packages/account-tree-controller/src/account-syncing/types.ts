import type { TraceCallback } from '@metamask/controller-utils';
import type { AccountTreeController } from 'src/AccountTreeController';
import type {
  AccountGroupMultichainAccountObject,
  AccountTreeGroupPersistedMetadata,
} from 'src/group';
import type { AccountTreeControllerMessenger } from 'src/types';
import type { AccountTreeWalletPersistedMetadata } from 'src/wallet';

import type { MultichainAccountSyncingEmitAnalyticsEventParams } from './analytics';

export type UserStorageSyncedWallet = AccountTreeWalletPersistedMetadata;

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
