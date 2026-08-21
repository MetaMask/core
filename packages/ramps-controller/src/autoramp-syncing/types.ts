import type { TraceCallback } from '@metamask/controller-utils';

import type { AutorampAccount } from '../autorampAccount.js';
import type { RampsControllerMessenger } from '../RampsController.js';
import type {
  USER_STORAGE_VERSION,
  USER_STORAGE_VERSION_KEY,
} from './constants.js';

/**
 * Compact User Storage entry for an autoramp account.
 * Omits deposit rail details — those are re-fetched from the Ramp API / MoonPay.
 */
export type UserStorageAutorampEntry = {
  [USER_STORAGE_VERSION_KEY]: typeof USER_STORAGE_VERSION;
  o: {
    id: string;
    customerId: string;
    walletAddress: string;
    status: string;
    lastSeenStatus: string;
    notifiedForStatus?: string;
  };
  lu?: number;
  dt?: number;
};

/**
 * {@link AutorampAccount} plus optional soft-delete metadata for sync merge.
 */
export type SyncAutorampAccount = AutorampAccount & {
  deletedAt?: number;
};

/**
 * Minimal controller surface required by autoramp syncing.
 */
export type AutorampSyncingController = {
  state: {
    autoramps: AutorampAccount[];
  };
  readonly isAutorampSyncingInProgress: boolean;
  setIsAutorampSyncingInProgress: (value: boolean) => void;
  setIsApplyingAutorampSyncChanges: (value: boolean) => void;
  addAutoramp: (account: AutorampAccount) => AutorampAccount;
  removeAutoramp: (autorampId: string) => void;
  getPendingRemoteAutorampDeletes: () => AutorampAccount[];
  acknowledgePendingRemoteAutorampDeletes: (
    accounts: AutorampAccount[],
  ) => void;
};

/**
 * Options for autoramp syncing operations.
 */
export type AutorampSyncingOptions = {
  getRampsControllerInstance: () => AutorampSyncingController;
  getMessenger: () => RampsControllerMessenger;
  trace?: TraceCallback;
};

/**
 * Optional callbacks for sync error reporting.
 */
export type SyncAutorampsWithUserStorageConfig = {
  onAutorampSyncErroneousSituation?: (
    errorMessage: string,
    sentryContext?: Record<string, unknown>,
  ) => void;
};
