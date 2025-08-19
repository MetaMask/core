import type {
  AccountGroupType,
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
  type Struct,
} from '@metamask/superstruct';

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

/**
 * Schema for an updatable field with value and timestamp.
 *
 * @param valueSchema - The schema for the value field.
 * @returns A superstruct schema for an updatable field.
 */
export const UpdatableFieldSchema = <T>(valueSchema: Struct<T>) =>
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

export type AtomicSyncEvent = {
  id: string;
  execute: () => Promise<void>;
};
