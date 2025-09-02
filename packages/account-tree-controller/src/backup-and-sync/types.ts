import type {
  AccountGroupId,
  AccountGroupType,
  AccountWalletId,
  AccountWalletType,
} from '@metamask/account-api';
import type { TraceCallback } from '@metamask/controller-utils';
import type { InternalAccount } from '@metamask/keyring-internal-api';
import type { Infer } from '@metamask/superstruct';
import {
  object,
  string,
  boolean,
  number,
  optional,
  type Struct,
} from '@metamask/superstruct';

import type { BackupAndSyncEmitAnalyticsEventParams } from './analytics';
import type { AccountTreeController } from '../AccountTreeController';
import type {
  AccountGroupMultichainAccountObject,
  AccountTreeGroupPersistedMetadata,
} from '../group';
import type { RuleResult } from '../rule';
import type { AccountTreeControllerMessenger } from '../types';
import type { AccountTreeWalletPersistedMetadata } from '../wallet';

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

export type BackupAndSyncContext = {
  messenger: AccountTreeControllerMessenger;
  controller: AccountTreeController;
  controllerStateUpdateFn: AccountTreeController['update'];
  traceFn: TraceCallback;
  groupIdToWalletId: Map<AccountGroupId, AccountWalletId>;
  emitAnalyticsEventFn: (event: BackupAndSyncEmitAnalyticsEventParams) => void;
  enableDebugLogging: boolean;
  disableMultichainAccountSyncing: boolean;
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
  id: string;
  execute: () => Promise<void>;
};
