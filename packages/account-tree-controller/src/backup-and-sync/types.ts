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

import type { AccountTreeController } from '../AccountTreeController.js';
import type {
  AccountGroupMultichainAccountObject,
  AccountTreeGroupPersistedMetadata,
} from '../group.js';
import type { RuleResult } from '../rule.js';
import type { AccountTreeControllerMessenger } from '../types.js';
import type { AccountTreeWalletPersistedMetadata } from '../wallet.js';
import type { BackupAndSyncEmitAnalyticsEventParams } from './analytics/index.js';

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
 * Tracks whether the current full sync run performed a real write, so the
 * service can gate emission of the full-sync trace.
 *
 * Writes are split by durability:
 * - Remote writes (pushes to user storage) are durable and always count.
 * - Local writes can be reverted by a per-wallet rollback, so the service
 *   reads the flag before a wallet and writes it back if that wallet rolls back.
 */
export type SyncMutationTracker = {
  /** Sets (or clears) the durable remote-write flag — a push to user storage. */
  setRemoteWrite: (value: boolean) => void;
  /** Gets the local-write flag — a write a per-wallet rollback would revert. */
  getLocalWrite: () => boolean;
  /** Sets, clears, or restores the local-write flag. */
  setLocalWrite: (value: boolean) => void;
  /** Whether any write (remote or local) is currently recorded. */
  hasOccurred: () => boolean;
  /** Clears all recorded writes at the start of a sync run. */
  reset: () => void;
};

export type BackupAndSyncContext = {
  messenger: AccountTreeControllerMessenger;
  controller: AccountTreeController;
  controllerStateUpdateFn: AccountTreeController['update'];
  traceFn: TraceCallback;
  groupIdToWalletId: Map<AccountGroupId, AccountWalletId>;
  emitAnalyticsEventFn: (event: BackupAndSyncEmitAnalyticsEventParams) => void;
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
