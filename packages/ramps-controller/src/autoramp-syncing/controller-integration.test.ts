import type { AutorampAccount } from '../autorampAccount.js';
import { AutorampStatus, createAutorampAccount } from '../autorampAccount.js';
import {
  USER_STORAGE_RAMPS_AUTORAMPS_FEATURE,
  USER_STORAGE_VERSION,
  USER_STORAGE_VERSION_KEY,
} from './constants.js';
import {
  computeAutorampMergePlan,
  deleteAutorampInRemoteStorage,
  syncAutorampsWithUserStorage,
  updateAutorampInRemoteStorage,
} from './controller-integration.js';
import { mapAutorampToUserStorageEntry } from './format-utils.js';
import type {
  AutorampSyncingController,
  AutorampSyncingOptions,
  SyncAutorampAccount,
} from './types.js';

/**
 * Builds an autoramp account with sync-relevant defaults.
 *
 * @param overrides - Fields to override on the generated account.
 * @returns A sync-aware autoramp account.
 */
function buildAccount(
  overrides: Partial<SyncAutorampAccount> & { id: string },
): SyncAutorampAccount {
  return {
    ...createAutorampAccount({
      customerId: 'customer-1',
      walletAddress: '0xwallet',
      status: AutorampStatus.Authorized,
      updatedAt: 1_000,
      ...overrides,
    }),
    ...(overrides.deletedAt === undefined
      ? {}
      : { deletedAt: overrides.deletedAt }),
  };
}

/**
 * Serializes an account the way User Storage would return it.
 *
 * @param account - Account to serialize.
 * @returns JSON string of the remote entry.
 */
function toRemoteEntryJson(account: SyncAutorampAccount): string {
  return JSON.stringify(mapAutorampToUserStorageEntry(account));
}

type Harness = {
  options: AutorampSyncingOptions;
  controller: jest.Mocked<AutorampSyncingController> & {
    state: { autoramps: AutorampAccount[] };
  };
  call: jest.Mock;
  onAutorampSyncErroneousSituation: jest.Mock;
  batchSetCalls: () => [string, string][][];
};

/**
 * Builds a sync test harness with a stubbed controller and messenger.
 *
 * @param args - Harness configuration.
 * @param args.localAccounts - Accounts present in controller state.
 * @param args.remoteEntries - Raw JSON entries returned by User Storage.
 * @param args.pendingDeletes - Accounts queued for remote soft-delete.
 * @param args.canSync - Whether the Backup & Sync gates should pass.
 * @param args.trace - Optional trace callback.
 * @returns The harness.
 */
function buildHarness({
  localAccounts = [],
  remoteEntries = [],
  pendingDeletes = [],
  canSync = true,
  trace,
}: {
  localAccounts?: AutorampAccount[];
  remoteEntries?: (string | null)[];
  pendingDeletes?: AutorampAccount[];
  canSync?: boolean;
  trace?: AutorampSyncingOptions['trace'];
} = {}): Harness {
  const batchSetCalls: [string, string][][] = [];

  const call = jest.fn((action: string, ...args: unknown[]) => {
    switch (action) {
      case 'UserStorageController:getState':
        return { isBackupAndSyncEnabled: canSync };
      case 'AuthenticationController:isSignedIn':
        return canSync;
      case 'UserStorageController:performGetStorageAllFeatureEntries':
        return remoteEntries;
      case 'UserStorageController:performBatchSetStorage':
        batchSetCalls.push(args[1] as [string, string][]);
        return undefined;
      default:
        throw new Error(`unexpected action ${action}`);
    }
  });

  const state = { autoramps: [...localAccounts] };

  const controller = {
    state,
    isAutorampSyncingInProgress: false,
    setIsAutorampSyncingInProgress: jest.fn(),
    setIsApplyingAutorampSyncChanges: jest.fn(),
    addAutoramp: jest.fn((account: AutorampAccount) => {
      const index = state.autoramps.findIndex(
        (entry) => entry.id === account.id,
      );
      if (index === -1) {
        state.autoramps.push(account);
      } else {
        state.autoramps[index] = account;
      }
      return account;
    }),
    removeAutoramp: jest.fn((autorampId: string) => {
      state.autoramps = state.autoramps.filter(
        (entry) => entry.id !== autorampId,
      );
      controller.state.autoramps = state.autoramps;
    }),
    getPendingRemoteAutorampDeletes: jest.fn(() => pendingDeletes),
    acknowledgePendingRemoteAutorampDeletes: jest.fn(),
  } as unknown as Harness['controller'];

  const onAutorampSyncErroneousSituation = jest.fn();

  return {
    options: {
      getRampsControllerInstance: () => controller,
      getMessenger: () => ({ call }) as never,
      ...(trace ? { trace } : {}),
    },
    controller,
    call,
    onAutorampSyncErroneousSituation,
    batchSetCalls: () => batchSetCalls,
  };
}

describe('computeAutorampMergePlan', () => {
  it('ignores remote tombstones for accounts that are absent locally', () => {
    const remote = buildAccount({ id: 'ar-1', deletedAt: 5_000 });

    const plan = computeAutorampMergePlan([], [remote]);

    expect(plan.accountsToDeleteLocally).toStrictEqual([]);
    expect(plan.accountsToAddOrUpdateLocally).toStrictEqual([]);
    expect(plan.accountsToUpdateRemotely).toStrictEqual([]);
  });

  it('re-uploads a local account that is newer than a remote tombstone', () => {
    const local = buildAccount({ id: 'ar-1', updatedAt: 9_000 });
    const remote = buildAccount({ id: 'ar-1', deletedAt: 5_000 });

    const plan = computeAutorampMergePlan([local], [remote]);

    expect(plan.accountsToUpdateRemotely.map((account) => account.id)).toStrictEqual(
      ['ar-1'],
    );
    expect(plan.accountsToDeleteLocally).toStrictEqual([]);
  });

  it('treats a local account with no timestamp as older than a tombstone', () => {
    const local = {
      ...buildAccount({ id: 'ar-1' }),
      updatedAt: undefined,
    } as unknown as SyncAutorampAccount;
    const remote = buildAccount({ id: 'ar-1', deletedAt: 5_000 });

    const plan = computeAutorampMergePlan([local], [remote]);

    expect(plan.accountsToDeleteLocally.map((account) => account.id)).toStrictEqual(
      ['ar-1'],
    );
  });

  it('imports the remote account when it is newer than the local copy', () => {
    const local = buildAccount({ id: 'ar-1', updatedAt: 1_000 });
    const remote = buildAccount({
      id: 'ar-1',
      status: AutorampStatus.Approved,
      updatedAt: 2_000,
    });

    const plan = computeAutorampMergePlan([local], [remote]);

    expect(plan.accountsToAddOrUpdateLocally.map((a) => a.status)).toStrictEqual([
      AutorampStatus.Approved,
    ]);
    expect(plan.accountsToUpdateRemotely).toStrictEqual([]);
  });

  it('plans no work when local and remote accounts match', () => {
    const local = buildAccount({ id: 'ar-1' });
    const remote = buildAccount({ id: 'ar-1' });

    const plan = computeAutorampMergePlan([local], [remote]);

    expect(plan.accountsToAddOrUpdateLocally).toStrictEqual([]);
    expect(plan.accountsToDeleteLocally).toStrictEqual([]);
    expect(plan.accountsToUpdateRemotely).toStrictEqual([]);
    expect([...plan.remoteAccountsMap.keys()]).toStrictEqual(['ar-1']);
  });
});

describe('syncAutorampsWithUserStorage', () => {
  it('does nothing when syncing is not permitted', async () => {
    const harness = buildHarness({ canSync: false });

    await syncAutorampsWithUserStorage({}, harness.options);

    expect(harness.controller.setIsAutorampSyncingInProgress).not.toHaveBeenCalled();
    expect(harness.batchSetCalls()).toStrictEqual([]);
  });

  it('returns early when User Storage holds no entries', async () => {
    const harness = buildHarness({ remoteEntries: [] });

    await syncAutorampsWithUserStorage({}, harness.options);

    expect(harness.batchSetCalls()).toStrictEqual([]);
    expect(harness.controller.setIsAutorampSyncingInProgress).toHaveBeenCalledWith(
      false,
    );
  });

  it('treats a null feature-entries response as empty', async () => {
    const harness = buildHarness();
    harness.call.mockImplementation((action: string) => {
      if (action === 'UserStorageController:getState') {
        return { isBackupAndSyncEnabled: true };
      }
      if (action === 'AuthenticationController:isSignedIn') {
        return true;
      }
      if (
        action === 'UserStorageController:performGetStorageAllFeatureEntries'
      ) {
        return null;
      }
      throw new Error(`unexpected action ${action}`);
    });

    await syncAutorampsWithUserStorage({}, harness.options);

    expect(harness.controller.addAutoramp).not.toHaveBeenCalled();
  });

  it('imports remote-only accounts into controller state', async () => {
    const remote = buildAccount({ id: 'ar-remote', updatedAt: 2_000 });
    const harness = buildHarness({ remoteEntries: [toRemoteEntryJson(remote)] });

    await syncAutorampsWithUserStorage({}, harness.options);

    expect(harness.controller.addAutoramp).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'ar-remote' }),
    );
    expect(
      harness.controller.setIsApplyingAutorampSyncChanges.mock.calls,
    ).toStrictEqual([[true], [false]]);
  });

  it('uploads local-only accounts to User Storage', async () => {
    const local = buildAccount({ id: 'ar-local', updatedAt: 3_000 });
    const other = buildAccount({ id: 'ar-other', updatedAt: 4_000 });
    const harness = buildHarness({
      localAccounts: [local, other],
      remoteEntries: [toRemoteEntryJson(other)],
    });

    await syncAutorampsWithUserStorage({}, harness.options);

    const [entries] = harness.batchSetCalls();
    expect(entries.map(([key]) => key)).toStrictEqual(['ar-local']);
  });

  it('stamps an upload that has no local timestamp', async () => {
    const local = {
      ...buildAccount({ id: 'ar-local' }),
      updatedAt: 0,
    } as unknown as AutorampAccount;
    const harness = buildHarness({ localAccounts: [local] });
    harness.call.mockImplementation((action: string, ...args: unknown[]) => {
      if (action === 'UserStorageController:getState') {
        return { isBackupAndSyncEnabled: true };
      }
      if (action === 'AuthenticationController:isSignedIn') {
        return true;
      }
      if (
        action === 'UserStorageController:performGetStorageAllFeatureEntries'
      ) {
        return [toRemoteEntryJson(buildAccount({ id: 'ar-untouched' }))];
      }
      if (action === 'UserStorageController:performBatchSetStorage') {
        const entries = args[1] as [string, string][];
        const uploaded = entries.find(([key]) => key === 'ar-local');
        expect(uploaded).toBeDefined();
        expect(JSON.parse((uploaded as [string, string])[1]).lu).toBeGreaterThan(
          0,
        );
        return undefined;
      }
      throw new Error(`unexpected action ${action}`);
    });

    await syncAutorampsWithUserStorage({}, harness.options);

    expect(harness.call).toHaveBeenCalledWith(
      'UserStorageController:performBatchSetStorage',
      USER_STORAGE_RAMPS_AUTORAMPS_FEATURE,
      expect.any(Array),
    );
  });

  it('deletes local accounts that were tombstoned remotely', async () => {
    const local = buildAccount({ id: 'ar-1', updatedAt: 1_000 });
    const tombstone = buildAccount({
      id: 'ar-1',
      updatedAt: 5_000,
      deletedAt: 5_000,
    });
    const harness = buildHarness({
      localAccounts: [local],
      remoteEntries: [toRemoteEntryJson(tombstone)],
    });

    await syncAutorampsWithUserStorage({}, harness.options);

    expect(harness.controller.removeAutoramp).toHaveBeenCalledWith('ar-1');
  });

  it('does not re-import a remote account that is queued for local deletion', async () => {
    const pending = buildAccount({ id: 'ar-pending', updatedAt: 1_000 });
    const harness = buildHarness({
      remoteEntries: [toRemoteEntryJson(pending)],
      pendingDeletes: [pending],
    });

    await syncAutorampsWithUserStorage({}, harness.options);

    expect(harness.controller.addAutoramp).not.toHaveBeenCalled();
  });

  it('uploads tombstones for pending remote deletes and acknowledges them', async () => {
    const pending = buildAccount({ id: 'ar-pending', updatedAt: 1_000 });
    const harness = buildHarness({
      remoteEntries: [toRemoteEntryJson(buildAccount({ id: 'ar-other' }))],
      pendingDeletes: [pending],
    });

    await syncAutorampsWithUserStorage({}, harness.options);

    const [entries] = harness.batchSetCalls();
    const tombstone = entries.find(([key]) => key === 'ar-pending');
    expect(tombstone).toBeDefined();
    expect(JSON.parse((tombstone as [string, string])[1]).dt).toBeGreaterThan(0);
    expect(
      harness.controller.acknowledgePendingRemoteAutorampDeletes,
    ).toHaveBeenCalledWith([pending]);
  });

  it('ignores pending deletes that have no storage key', async () => {
    const harness = buildHarness({
      remoteEntries: [toRemoteEntryJson(buildAccount({ id: 'ar-other' }))],
      pendingDeletes: [
        { ...buildAccount({ id: 'ar-pending' }), id: '' } as AutorampAccount,
      ],
    });

    await syncAutorampsWithUserStorage({}, harness.options);

    expect(
      harness.controller.acknowledgePendingRemoteAutorampDeletes,
    ).not.toHaveBeenCalled();
  });

  it('re-uploads a local account whose newer remote copy was not imported', async () => {
    // The account is queued for deletion, so the newer remote copy is not
    // applied locally; the surviving local copy still has to reach the remote.
    const local = buildAccount({ id: 'ar-1', updatedAt: 1_000 });
    const remote = buildAccount({
      id: 'ar-1',
      status: AutorampStatus.Approved,
      updatedAt: 5_000,
    });
    const harness = buildHarness({
      localAccounts: [local],
      remoteEntries: [toRemoteEntryJson(remote)],
      pendingDeletes: [local],
    });

    await syncAutorampsWithUserStorage({}, harness.options);

    expect(harness.controller.addAutoramp).not.toHaveBeenCalled();
    const [entries] = harness.batchSetCalls();
    expect(entries.map(([key]) => key)).toStrictEqual(['ar-1']);
    expect(JSON.parse(entries[0][1]).o.status).toBe(AutorampStatus.Authorized);
  });

  it('stamps a re-uploaded local account that has no timestamp', async () => {
    const local = {
      ...buildAccount({ id: 'ar-1' }),
      updatedAt: 0,
    } as unknown as AutorampAccount;
    const remote = buildAccount({
      id: 'ar-1',
      status: AutorampStatus.Approved,
      updatedAt: 5_000,
    });
    const harness = buildHarness({
      localAccounts: [local],
      remoteEntries: [toRemoteEntryJson(remote)],
      pendingDeletes: [local],
    });

    await syncAutorampsWithUserStorage({}, harness.options);

    const [entries] = harness.batchSetCalls();
    expect(JSON.parse(entries[0][1]).lu).toBeGreaterThan(0);
  });

  it('reports an unsupported storage version and skips the entry', async () => {
    const harness = buildHarness({
      remoteEntries: [
        JSON.stringify({
          [USER_STORAGE_VERSION_KEY]: '999',
          o: { id: 'ar-1' },
        }),
      ],
    });

    await syncAutorampsWithUserStorage(
      {
        onAutorampSyncErroneousSituation:
          harness.onAutorampSyncErroneousSituation,
      },
      harness.options,
    );

    expect(harness.onAutorampSyncErroneousSituation).toHaveBeenCalledWith(
      'Unsupported autoramp storage version',
      { version: '999', expectedVersion: USER_STORAGE_VERSION },
    );
    expect(harness.controller.addAutoramp).not.toHaveBeenCalled();
  });

  it('reports a remote entry that is missing its payload', async () => {
    const harness = buildHarness({
      remoteEntries: [
        JSON.stringify({ [USER_STORAGE_VERSION_KEY]: USER_STORAGE_VERSION }),
      ],
    });

    await syncAutorampsWithUserStorage(
      {
        onAutorampSyncErroneousSituation:
          harness.onAutorampSyncErroneousSituation,
      },
      harness.options,
    );

    expect(harness.onAutorampSyncErroneousSituation).toHaveBeenCalledWith(
      'Remote autoramp entry missing payload',
      {},
    );
  });

  it('reports a remote entry that cannot be parsed', async () => {
    const harness = buildHarness({ remoteEntries: ['not json'] });

    await syncAutorampsWithUserStorage(
      {
        onAutorampSyncErroneousSituation:
          harness.onAutorampSyncErroneousSituation,
      },
      harness.options,
    );

    expect(harness.onAutorampSyncErroneousSituation).toHaveBeenCalledWith(
      'Failed to parse remote autoramp entry',
      expect.objectContaining({ entryLength: 'not json'.length }),
    );
  });

  it('skips a remote entry whose payload has no id', async () => {
    const harness = buildHarness({
      remoteEntries: [
        JSON.stringify({
          [USER_STORAGE_VERSION_KEY]: USER_STORAGE_VERSION,
          o: {
            id: '',
            customerId: 'c',
            walletAddress: '0x1',
            status: AutorampStatus.Authorized,
            lastSeenStatus: AutorampStatus.Authorized,
          },
          lu: 1_000,
        }),
      ],
    });

    await syncAutorampsWithUserStorage(
      {
        onAutorampSyncErroneousSituation:
          harness.onAutorampSyncErroneousSituation,
      },
      harness.options,
    );

    expect(harness.controller.addAutoramp).not.toHaveBeenCalled();
    expect(harness.onAutorampSyncErroneousSituation).not.toHaveBeenCalled();
  });

  it('skips a remote write whose account has an empty storage key', async () => {
    const harness = buildHarness({
      localAccounts: [
        { ...buildAccount({ id: 'ar-local' }), id: '' } as AutorampAccount,
      ],
      remoteEntries: [toRemoteEntryJson(buildAccount({ id: 'ar-other' }))],
    });
    harness.controller.getPendingRemoteAutorampDeletes.mockReturnValue([]);

    await syncAutorampsWithUserStorage(
      {
        onAutorampSyncErroneousSituation:
          harness.onAutorampSyncErroneousSituation,
      },
      harness.options,
    );

    expect(harness.batchSetCalls()).toStrictEqual([]);
  });

  it('reports and rethrows when the sync fails', async () => {
    const harness = buildHarness();
    const failure = new Error('storage down');
    harness.call.mockImplementation((action: string) => {
      if (action === 'UserStorageController:getState') {
        return { isBackupAndSyncEnabled: true };
      }
      if (action === 'AuthenticationController:isSignedIn') {
        return true;
      }
      throw failure;
    });

    await expect(
      syncAutorampsWithUserStorage(
        {
          onAutorampSyncErroneousSituation:
            harness.onAutorampSyncErroneousSituation,
        },
        harness.options,
      ),
    ).rejects.toThrow('storage down');

    expect(harness.onAutorampSyncErroneousSituation).toHaveBeenCalledWith(
      'Error synchronizing autoramps',
      { error: failure },
    );
    expect(harness.controller.setIsAutorampSyncingInProgress).toHaveBeenLastCalledWith(
      false,
    );
  });

  it('wraps the sync and the batch save in traces when a callback is given', async () => {
    const traceNames: string[] = [];
    const trace = jest.fn(async (request: { name: string }, fn?: () => unknown) => {
      traceNames.push(request.name);
      return await (fn as () => Promise<unknown>)();
    }) as unknown as AutorampSyncingOptions['trace'];

    const harness = buildHarness({
      localAccounts: [buildAccount({ id: 'ar-local' })],
      remoteEntries: [toRemoteEntryJson(buildAccount({ id: 'ar-other' }))],
      trace,
    });

    await syncAutorampsWithUserStorage({}, harness.options);

    expect(traceNames).toStrictEqual([
      'Ramps Autoramp Sync Full',
      'Ramps Autoramp Sync Save Batch',
    ]);
  });
});

describe('updateAutorampInRemoteStorage', () => {
  it('writes the account with a refreshed timestamp', async () => {
    const harness = buildHarness();

    await updateAutorampInRemoteStorage(
      buildAccount({ id: 'ar-1' }),
      harness.options,
    );

    const [entries] = harness.batchSetCalls();
    expect(entries.map(([key]) => key)).toStrictEqual(['ar-1']);
  });

  it('does nothing when syncing is not permitted', async () => {
    const harness = buildHarness({ canSync: false });

    await updateAutorampInRemoteStorage(
      buildAccount({ id: 'ar-1' }),
      harness.options,
    );

    expect(harness.batchSetCalls()).toStrictEqual([]);
  });

  it('does nothing for an account that is not syncable', async () => {
    const harness = buildHarness();

    await updateAutorampInRemoteStorage(
      { ...buildAccount({ id: 'ar-1' }), id: '' },
      harness.options,
    );

    expect(harness.batchSetCalls()).toStrictEqual([]);
  });

  it('wraps the write in a trace when a callback is given', async () => {
    const trace = jest.fn(async (_request: unknown, fn?: () => unknown) =>
      (fn as () => Promise<unknown>)(),
    ) as unknown as AutorampSyncingOptions['trace'];
    const harness = buildHarness({ trace });

    await updateAutorampInRemoteStorage(
      buildAccount({ id: 'ar-1' }),
      harness.options,
    );

    expect(trace).toHaveBeenCalled();
    expect(harness.batchSetCalls()).toHaveLength(1);
  });
});

describe('deleteAutorampInRemoteStorage', () => {
  it('writes a tombstone for the account', async () => {
    const harness = buildHarness();

    await deleteAutorampInRemoteStorage(
      buildAccount({ id: 'ar-1' }),
      harness.options,
    );

    const [entries] = harness.batchSetCalls();
    expect(JSON.parse(entries[0][1]).dt).toBeGreaterThan(0);
  });

  it('does nothing when syncing is not permitted', async () => {
    const harness = buildHarness({ canSync: false });

    await deleteAutorampInRemoteStorage(
      buildAccount({ id: 'ar-1' }),
      harness.options,
    );

    expect(harness.batchSetCalls()).toStrictEqual([]);
  });

  it('does nothing for an account with no id', async () => {
    const harness = buildHarness();

    await deleteAutorampInRemoteStorage(
      { ...buildAccount({ id: 'ar-1' }), id: '' },
      harness.options,
    );

    expect(harness.batchSetCalls()).toStrictEqual([]);
  });

  it('wraps the tombstone write in a trace when a callback is given', async () => {
    const trace = jest.fn(async (_request: unknown, fn?: () => unknown) =>
      (fn as () => Promise<unknown>)(),
    ) as unknown as AutorampSyncingOptions['trace'];
    const harness = buildHarness({ trace });

    await deleteAutorampInRemoteStorage(
      buildAccount({ id: 'ar-1' }),
      harness.options,
    );

    expect(trace).toHaveBeenCalled();
    expect(harness.batchSetCalls()).toHaveLength(1);
  });
});
