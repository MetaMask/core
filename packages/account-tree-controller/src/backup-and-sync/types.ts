import type {
  AccountGroupId,
  AccountGroupType,
  AccountWalletId,
  AccountWalletType,
} from '@metamask/account-api';
import type { TraceCallback } from '@metamask/controller-utils';
import type { InternalAccount } from '@metamask/keyring-internal-api';
import {
  object,
  string,
  boolean,
  number,
  optional,
} from '@metamask/superstruct';
import type { Infer, Struct } from '@metamask/superstruct';

import type { AccountTreeController } from '../AccountTreeController';
import type {
  AccountGroupMultichainAccountObject,
  AccountTreeGroupPersistedMetadata,
} from '../group';
import type { RuleResult } from '../rule';
import type { AccountTreeControllerMessenger } from '../types';
import type { AccountTreeWalletPersistedMetadata } from '../wallet';
import type { BackupAndSyncEmitAnalyticsEventParams } from './analytics';

/**
 * Schema for an updatable field with value and timestamp.
 *
 * @param valueSchema - The schema for the value field.
 * @returns A superstruct schema for an updatable field.
 */
const UpdatableFieldSchema = <T>(valueSchema: Struct<T>) =>
  object({
    value: valueSchema,
    lastUpdatedAt: number(),
  });

/**
 * Superstruct schema for UserStorageSyncedWallet validation.
 */
export const UserStorageSyncedWalletSchema = object({
  name: optional(UpdatableFieldSchema(string())),
  isLegacyAccountSyncingDisabled: optional(boolean()),
});

/**
 * Superstruct schema for UserStorageSyncedWalletGroup validation.
 */
export const UserStorageSyncedWalletGroupSchema = object({
  name: optional(UpdatableFieldSchema(string())),
  pinned: optional(UpdatableFieldSchema(boolean())),
  hidden: optional(UpdatableFieldSchema(boolean())),
  groupIndex: number(),
});

/**
 * Superstruct schema for LegacyUserStorageSyncedAccount validation.
 */
export const LegacyUserStorageSyncedAccountSchema = object({
  v: optional(string()),
  i: optional(string()),
  a: optional(string()),
  n: optional(string()),
  nlu: optional(number()),
});

export type UserStorageSyncedWallet = AccountTreeWalletPersistedMetadata &
  Infer<typeof UserStorageSyncedWalletSchema>;

export type UserStorageSyncedWalletGroup = AccountTreeGroupPersistedMetadata & {
  groupIndex: AccountGroupMultichainAccountObject['metadata']['entropy']['groupIndex'];
} & Infer<typeof UserStorageSyncedWalletGroupSchema>;

export type LegacyUserStorageSyncedAccount = Infer<
  typeof LegacyUserStorageSyncedAccountSchema
>;

/**
 * Tracks whether the current full sync run performed a real write (a local
 * mutation or a remote push), so the service can gate emission of the
 * full-sync trace.
 */
export type SyncMutationTracker = {
  /** Records that a real write happened during the current sync run. */
  markOccurred: () => void;
  /** Whether a real write has been recorded since the last reset. */
  hasOccurred: () => boolean;
  /** Clears the tracker at the start of a sync run. */
  reset: () => void;
};

export type BackupAndSyncContext = {
  messenger: AccountTreeControllerMessenger;
  controller: AccountTreeController;
  controllerStateUpdateFn: AccountTreeController['update'];
  traceFn: TraceCallback;
  groupIdToWalletId: Map<AccountGroupId, AccountWalletId>;
  emitAnalyticsEventFn: (event: BackupAndSyncEmitAnalyticsEventParams) => void;
  /**
   * Tracks whether the current sync run performed a real write (a local
   * mutation or a remote push). Sync helpers call `markOccurred()`; the service
   * reads it to gate emission of the full-sync trace.
   */
  mutationTracker?: SyncMutationTracker;
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

export type AtomicSyncEvent = {
  execute: () => Promise<void>;
};
