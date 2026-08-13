import { AutorampStatus, createAutorampAccount } from '../autorampAccount.js';
import { computeAutorampMergePlan } from './controller-integration.js';
import { canPerformAutorampSyncing } from './sync-utils.js';
import type { AutorampSyncingOptions } from './types.js';

describe('autoramp-syncing/sync-utils', () => {
  it('returns false when messenger actions are unavailable', () => {
    const options: AutorampSyncingOptions = {
      getMessenger: () =>
        ({
          call: () => {
            throw new Error('not delegated');
          },
        }) as AutorampSyncingOptions['getMessenger'] extends () => infer R
          ? R
          : never,
      getRampsControllerInstance: () => ({
        state: { autoramps: [] },
        isAutorampSyncingInProgress: false,
        setIsAutorampSyncingInProgress: jest.fn(),
        setIsApplyingAutorampSyncChanges: jest.fn(),
        addAutoramp: jest.fn(),
        removeAutoramp: jest.fn(),
        getPendingRemoteAutorampDeletes: (): [] => [],
        acknowledgePendingRemoteAutorampDeletes: jest.fn(),
      }),
    };

    expect(canPerformAutorampSyncing(options)).toBe(false);
  });

  it('returns true when B&S and auth gates pass', () => {
    const call = jest.fn((action: string) => {
      if (action === 'UserStorageController:getState') {
        return { isBackupAndSyncEnabled: true };
      }
      if (action === 'AuthenticationController:isSignedIn') {
        return true;
      }
      throw new Error(`unexpected ${action}`);
    });

    const options = {
      getMessenger: () => ({ call }) as never,
      getRampsControllerInstance: () => ({
        state: { autoramps: [] },
        isAutorampSyncingInProgress: false,
        setIsAutorampSyncingInProgress: jest.fn(),
        setIsApplyingAutorampSyncChanges: jest.fn(),
        addAutoramp: jest.fn(),
        removeAutoramp: jest.fn(),
        getPendingRemoteAutorampDeletes: (): [] => [],
        acknowledgePendingRemoteAutorampDeletes: jest.fn(),
      }),
    } as AutorampSyncingOptions;

    expect(canPerformAutorampSyncing(options)).toBe(true);
  });
});

describe('autoramp-syncing/computeAutorampMergePlan', () => {
  it('imports remote-only accounts and uploads local-only accounts', () => {
    const local = createAutorampAccount({
      id: 'local-1',
      customerId: 'c',
      walletAddress: '0x1',
      status: AutorampStatus.Authorized,
      updatedAt: 10,
    });
    const remote = createAutorampAccount({
      id: 'remote-1',
      customerId: 'c',
      walletAddress: '0x2',
      status: AutorampStatus.Approved,
      updatedAt: 20,
    });

    const plan = computeAutorampMergePlan([local], [remote]);

    expect(plan.accountsToAddOrUpdateLocally.map((a) => a.id)).toStrictEqual([
      'remote-1',
    ]);
    expect(plan.accountsToUpdateRemotely.map((a) => a.id)).toStrictEqual([
      'local-1',
    ]);
  });

  it('prefers newer timestamp on conflicts', () => {
    const local = createAutorampAccount({
      id: 'ar-1',
      customerId: 'c',
      walletAddress: '0x1',
      status: AutorampStatus.Authorized,
      updatedAt: 50,
    });
    const remote = {
      ...createAutorampAccount({
        id: 'ar-1',
        customerId: 'c',
        walletAddress: '0x1',
        status: AutorampStatus.Approved,
        updatedAt: 10,
      }),
    };

    const plan = computeAutorampMergePlan([local], [remote]);
    expect(plan.accountsToUpdateRemotely).toHaveLength(1);
    expect(plan.accountsToAddOrUpdateLocally).toHaveLength(0);
  });

  it('applies remote tombstones when local is older', () => {
    const local = createAutorampAccount({
      id: 'ar-1',
      customerId: 'c',
      walletAddress: '0x1',
      status: AutorampStatus.Authorized,
      updatedAt: 10,
    });
    const remote = {
      ...local,
      deletedAt: 20,
      updatedAt: 20,
    };

    const plan = computeAutorampMergePlan([local], [remote]);
    expect(plan.accountsToDeleteLocally).toHaveLength(1);
  });
});
