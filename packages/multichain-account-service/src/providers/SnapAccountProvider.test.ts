import { isBip44Account } from '@metamask/account-api';
import type { Bip44Account } from '@metamask/account-api';
import type { TraceCallback, TraceRequest } from '@metamask/controller-utils';
import { KeyringRpcMethod } from '@metamask/keyring-api';
import type {
  DeleteAccountRequest,
  GetAccountRequest,
} from '@metamask/keyring-api';
import type { EntropySourceId, KeyringAccount } from '@metamask/keyring-api';
import type { InternalAccount } from '@metamask/keyring-internal-api';
import type { JsonRpcRequest, SnapId } from '@metamask/snaps-sdk';

import { BtcAccountProvider } from './BtcAccountProvider';
import type { SnapAccountProviderConfig } from './SnapAccountProvider';
import {
  isSnapAccountProvider,
  SnapAccountProvider,
} from './SnapAccountProvider';
import { SolAccountProvider } from './SolAccountProvider';
import { TrxAccountProvider } from './TrxAccountProvider';
import { traceFallback } from '../analytics';
import type { RootMessenger } from '../tests';
import {
  asKeyringAccount,
  getMultichainAccountServiceMessenger,
  getRootMessenger,
  MOCK_HD_ACCOUNT_1,
  MOCK_HD_ACCOUNT_2,
  MockAccountBuilder,
} from '../tests';
import type { MultichainAccountServiceMessenger } from '../types';

jest.mock('../analytics', () => {
  const actual = jest.requireActual('../analytics');
  return {
    ...actual,
    traceFallback: jest.fn(),
  };
});

const THROTTLED_OPERATION_DELAY_MS = 10;
const TEST_SNAP_ID = 'npm:@metamask/test-snap' as SnapId;
const TEST_ENTROPY_SOURCE = 'test-entropy-source' as EntropySourceId;

class MockSnapAccountProvider extends SnapAccountProvider {
  readonly tracker: {
    startLog: number[];
    endLog: number[];
    activeCount: number;
    maxActiveCount: number;
  };

  constructor(
    snapId: SnapId,
    messenger: MultichainAccountServiceMessenger,
    config: SnapAccountProviderConfig,
    /* istanbul ignore next */
    trace: TraceCallback = traceFallback,
  ) {
    super(snapId, messenger, config, trace);

    // Tracker to monitor concurrent executions.
    this.tracker = {
      startLog: [],
      endLog: [],
      activeCount: 0,
      maxActiveCount: 0,
    };
  }

  getName(): string {
    return 'Test Provider';
  }

  isAccountCompatible(): boolean {
    return true;
  }

  async discoverAccounts(): Promise<Bip44Account<KeyringAccount>[]> {
    return [];
  }

  async createAccounts(options: {
    entropySource: EntropySourceId;
    groupIndex: number;
  }): Promise<Bip44Account<KeyringAccount>[]> {
    const { tracker } = this;

    return this.withMaxConcurrency(async () => {
      tracker.startLog.push(options.groupIndex);
      tracker.activeCount += 1;
      tracker.maxActiveCount = Math.max(
        tracker.maxActiveCount,
        tracker.activeCount,
      );
      await new Promise((resolve) =>
        setTimeout(resolve, THROTTLED_OPERATION_DELAY_MS),
      );
      tracker.activeCount -= 1;
      tracker.endLog.push(options.groupIndex);
      return [];
    });
  }

  // Expose protected trace method as public for testing
  async trace<ReturnType>(
    request: TraceRequest,
    fn: () => Promise<ReturnType>,
  ): Promise<ReturnType> {
    return super.trace(request, fn);
  }
}

// Helper to create a tracked provider that monitors concurrent execution
const setup = ({
  maxConcurrency,
  messenger = getRootMessenger(),
  accounts = [],
}: {
  maxConcurrency?: number;
  messenger?: RootMessenger;
  accounts?: InternalAccount[];
} = {}) => {
  const mocks = {
    AccountsController: {
      listMultichainAccounts: jest.fn(),
    },
    ErrorReportingService: {
      captureException: jest.fn(),
    },
    SnapController: {
      handleKeyringRequest: {
        getAccount: jest.fn(),
        listAccounts: jest.fn(),
        deleteAccount: jest.fn(),
      },
      handleRequest: jest.fn(),
    },
    MultichainAccountService: {
      ensureCanUseSnapPlatform: jest.fn(),
    },
  };

  messenger.registerActionHandler(
    'AccountsController:listMultichainAccounts',
    mocks.AccountsController.listMultichainAccounts,
  );
  mocks.AccountsController.listMultichainAccounts.mockReturnValue(accounts);

  messenger.registerActionHandler(
    'MultichainAccountService:ensureCanUseSnapPlatform',
    mocks.MultichainAccountService.ensureCanUseSnapPlatform,
  );
  // Make the platform ready right away (having a resolved promise is enough).
  mocks.MultichainAccountService.ensureCanUseSnapPlatform.mockResolvedValue(
    undefined,
  );

  messenger.registerActionHandler(
    'SnapController:handleRequest',
    mocks.SnapController.handleRequest,
  );
  mocks.SnapController.handleRequest.mockImplementation(
    async ({ request }: { request: JsonRpcRequest }) => {
      if (request.method === String(KeyringRpcMethod.GetAccount)) {
        return await mocks.SnapController.handleKeyringRequest.getAccount(
          (request as GetAccountRequest).params.id,
        );
      } else if (request.method === String(KeyringRpcMethod.ListAccounts)) {
        return await mocks.SnapController.handleKeyringRequest.listAccounts();
      } else if (request.method === String(KeyringRpcMethod.DeleteAccount)) {
        return await mocks.SnapController.handleKeyringRequest.deleteAccount(
          (request as DeleteAccountRequest).params.id,
        );
      }
      throw new Error(`Unhandled method: ${request.method}`);
    },
  );
  mocks.SnapController.handleKeyringRequest.getAccount.mockImplementation(
    async (id) =>
      accounts.map(asKeyringAccount).find((account) => account.id === id),
  );
  mocks.SnapController.handleKeyringRequest.listAccounts.mockImplementation(
    async () => accounts.map(asKeyringAccount),
  );
  mocks.SnapController.handleKeyringRequest.deleteAccount.mockResolvedValue(
    null,
  );

  const keyring = {
    createAccount: jest.fn(),
    removeAccount: jest.fn(),
  };

  messenger.registerActionHandler(
    'KeyringController:withKeyring',
    jest
      .fn()
      .mockImplementation(
        async (_ /* selector */, operation) => await operation({ keyring }),
      ),
  );

  const serviceMessenger = getMultichainAccountServiceMessenger(messenger, {
    // We need this extra action to be able to mock it.
    actions: ['MultichainAccountService:ensureCanUseSnapPlatform'],
  });
  const config = {
    ...(maxConcurrency !== undefined && { maxConcurrency }),
    createAccounts: {
      timeoutMs: 5000,
    },
    discovery: {
      timeoutMs: 2000,
      maxAttempts: 3,
      backOffMs: 1000,
    },
  };
  const provider = new MockSnapAccountProvider(
    TEST_SNAP_ID,
    serviceMessenger,
    config,
  );

  return {
    messenger,
    provider,
    tracker: provider.tracker,
    keyring,
    mocks,
  };
};

describe('SnapAccountProvider', () => {
  describe('constructor default parameters', () => {
    it('creates SolAccountProvider with default trace using 1 parameter', () => {
      const { messenger } = setup();

      const provider = new SolAccountProvider(
        getMultichainAccountServiceMessenger(messenger),
      );
      expect(provider).toBeDefined();
      expect(provider.snapId).toBe(SolAccountProvider.SOLANA_SNAP_ID);
    });

    it('creates SolAccountProvider with default trace using 2 parameters', () => {
      const { messenger } = setup();

      const provider = new SolAccountProvider(
        getMultichainAccountServiceMessenger(messenger),
        undefined,
      );
      expect(provider).toBeDefined();
      expect(provider.snapId).toBe(SolAccountProvider.SOLANA_SNAP_ID);
    });

    it('creates SolAccountProvider with custom trace using 3 parameters', () => {
      const { messenger } = setup();

      const customTrace = jest.fn();
      const provider = new SolAccountProvider(
        getMultichainAccountServiceMessenger(messenger),
        undefined,
        customTrace,
      );
      expect(provider).toBeDefined();
      expect(provider.snapId).toBe(SolAccountProvider.SOLANA_SNAP_ID);
    });

    it('creates SolAccountProvider with custom config and default trace', () => {
      const { messenger } = setup();

      const customConfig = {
        discovery: {
          timeoutMs: 3000,
          maxAttempts: 5,
          backOffMs: 2000,
        },
        createAccounts: {
          timeoutMs: 5000,
        },
      };
      const provider = new SolAccountProvider(
        getMultichainAccountServiceMessenger(messenger),
        customConfig,
      );
      expect(provider).toBeDefined();
      expect(provider.snapId).toBe(SolAccountProvider.SOLANA_SNAP_ID);
    });

    it('creates BtcAccountProvider with default trace', () => {
      const { messenger } = setup();

      // Test other subclasses to ensure branch coverage
      const btcProvider = new BtcAccountProvider(
        getMultichainAccountServiceMessenger(messenger),
      );

      expect(btcProvider).toBeDefined();
      expect(isSnapAccountProvider(btcProvider)).toBe(true);
    });

    it('creates TrxAccountProvider with custom trace', () => {
      const { messenger } = setup();

      const customTrace = jest.fn();

      // Explicitly test with all three parameters
      const trxProvider = new TrxAccountProvider(
        getMultichainAccountServiceMessenger(messenger),
        undefined,
        customTrace,
      );

      expect(trxProvider).toBeDefined();
      expect(isSnapAccountProvider(trxProvider)).toBe(true);
    });

    it('creates provider without trace parameter', () => {
      const { messenger } = setup();

      // Test creating provider without passing trace parameter
      const provider = new SolAccountProvider(
        getMultichainAccountServiceMessenger(messenger),
        undefined,
      );

      expect(provider).toBeDefined();
    });

    it('tests parameter spreading to trigger branch coverage', () => {
      const { messenger } = setup();

      type SolConfig = ConstructorParameters<typeof SolAccountProvider>[1];
      type ProviderArgs = [
        MultichainAccountServiceMessenger,
        SolConfig?,
        TraceCallback?,
      ];
      const args: ProviderArgs = [
        getMultichainAccountServiceMessenger(messenger),
      ];
      const provider1 = new SolAccountProvider(...args);

      args.push(undefined);
      args.push(jest.fn());
      const provider2 = new SolAccountProvider(...args);

      expect(provider1).toBeDefined();
      expect(provider2).toBeDefined();
    });
  });

  describe('isSnapAccountProvider', () => {
    it('returns false for plain object with snapId property', () => {
      const mockProvider = { snapId: 'test-snap-id' };

      expect(isSnapAccountProvider(mockProvider)).toBe(false);
    });

    it('returns false for null', () => {
      expect(isSnapAccountProvider(null)).toBe(false);
    });

    it('returns false for undefined', () => {
      expect(isSnapAccountProvider(undefined)).toBe(false);
    });

    it('returns false for object without snapId property', () => {
      const mockProvider = { otherProperty: 'value' };

      expect(isSnapAccountProvider(mockProvider)).toBe(false);
    });

    it('returns false for primitive values', () => {
      expect(isSnapAccountProvider('string')).toBe(false);
      expect(isSnapAccountProvider(123)).toBe(false);
      expect(isSnapAccountProvider(true)).toBe(false);
    });

    it('returns true for actual SnapAccountProvider instance', () => {
      const { messenger } = setup();

      const solProvider = new SolAccountProvider(
        getMultichainAccountServiceMessenger(messenger),
      );
      expect(isSnapAccountProvider(solProvider)).toBe(true);
    });
  });

  describe('trace functionality', () => {
    const traceFallbackMock = traceFallback as jest.MockedFunction<
      typeof traceFallback
    >;

    beforeEach(() => {
      jest.clearAllMocks();
      traceFallbackMock.mockClear();
    });

    it('uses default trace parameter when only messenger is provided', async () => {
      const { messenger } = setup();

      traceFallbackMock.mockImplementation(async (_request, fn) => fn?.());

      // Test with default config and trace
      const defaultConfig = {
        discovery: {
          timeoutMs: 2000,
          maxAttempts: 3,
          backOffMs: 1000,
        },
        createAccounts: {
          timeoutMs: 3000,
        },
      };
      const testProvider = new MockSnapAccountProvider(
        TEST_SNAP_ID,
        getMultichainAccountServiceMessenger(messenger),
        defaultConfig,
      );
      const request = { name: 'Test Request', data: {} };
      const fn = jest.fn().mockResolvedValue('defaultResult');

      await testProvider.trace(request, fn);

      expect(traceFallbackMock).toHaveBeenCalledTimes(1);
      expect(traceFallbackMock).toHaveBeenCalledWith(
        request,
        expect.any(Function),
      );
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('uses custom trace when explicitly provided with all parameters', async () => {
      const { messenger } = setup();

      const customTrace = jest.fn().mockImplementation(async (_request, fn) => {
        return await fn();
      });

      // Test with all parameters including custom trace
      const testProvider = new MockSnapAccountProvider(
        TEST_SNAP_ID,
        getMultichainAccountServiceMessenger(messenger),
        {
          discovery: {
            timeoutMs: 2000,
            maxAttempts: 3,
            backOffMs: 1000,
          },
          createAccounts: {
            timeoutMs: 3000,
          },
        },
        customTrace,
      );
      const request = { name: 'Test Request', data: {} };
      const fn = jest.fn().mockResolvedValue('customResult');

      const result = await testProvider.trace(request, fn);

      expect(result).toBe('customResult');
      expect(customTrace).toHaveBeenCalledTimes(1);
      expect(customTrace).toHaveBeenCalledWith(request, expect.any(Function));
      expect(traceFallbackMock).not.toHaveBeenCalled();
    });

    it('calls trace callback with the correct arguments', async () => {
      const { messenger } = setup();

      const mockTrace = jest.fn().mockImplementation(async (request, fn) => {
        expect(request).toStrictEqual({
          name: 'Test Request',
          data: { test: 'data' },
        });
        return await fn();
      });

      const defaultConfig = {
        discovery: {
          timeoutMs: 2000,
          maxAttempts: 3,
          backOffMs: 1000,
        },
        createAccounts: {
          timeoutMs: 3000,
        },
      };
      const testProvider = new MockSnapAccountProvider(
        TEST_SNAP_ID,
        getMultichainAccountServiceMessenger(messenger),
        defaultConfig,
        mockTrace,
      );
      const request = { name: 'Test Request', data: { test: 'data' } };
      const fn = jest.fn().mockResolvedValue('testResult');

      const result = await testProvider.trace(request, fn);

      expect(result).toBe('testResult');
      expect(mockTrace).toHaveBeenCalledTimes(1);
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('propagates errors through trace callback', async () => {
      const { messenger } = setup();

      const mockError = new Error('Test error');
      const mockTrace = jest.fn().mockImplementation(async (_request, fn) => {
        return await fn();
      });

      const defaultConfig = {
        discovery: {
          timeoutMs: 2000,
          maxAttempts: 3,
          backOffMs: 1000,
        },
        createAccounts: {
          timeoutMs: 3000,
        },
      };
      const testProvider = new MockSnapAccountProvider(
        TEST_SNAP_ID,
        getMultichainAccountServiceMessenger(messenger),
        defaultConfig,
        mockTrace,
      );
      const request = { name: 'Test Request', data: {} };
      const fn = jest.fn().mockRejectedValue(mockError);

      await expect(testProvider.trace(request, fn)).rejects.toThrow(mockError);

      expect(mockTrace).toHaveBeenCalledTimes(1);
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('handles trace callback returning undefined', async () => {
      const { messenger } = setup();

      const mockTrace = jest.fn().mockImplementation(async (_request, fn) => {
        return await fn();
      });

      const defaultConfig = {
        discovery: {
          timeoutMs: 2000,
          maxAttempts: 3,
          backOffMs: 1000,
        },
        createAccounts: {
          timeoutMs: 3000,
        },
      };
      const testProvider = new MockSnapAccountProvider(
        TEST_SNAP_ID,
        getMultichainAccountServiceMessenger(messenger),
        defaultConfig,
        mockTrace,
      );
      const request = { name: 'Test Request', data: {} };
      const fn = jest.fn().mockResolvedValue(undefined);

      const result = await testProvider.trace(request, fn);

      expect(result).toBeUndefined();
      expect(mockTrace).toHaveBeenCalledTimes(1);
      expect(fn).toHaveBeenCalledTimes(1);
    });
  });

  describe('withMaxConcurrency', () => {
    afterEach(() => {
      jest.clearAllTimers();
      jest.useRealTimers();
    });

    it('throttles createAccounts when maxConcurrency is finite', async () => {
      const { provider, tracker } = setup({ maxConcurrency: 2 }); // Allow only 2 concurrent operations

      // Start 4 concurrent calls
      const promises = [0, 1, 2, 3].map((index) =>
        provider.createAccounts({
          entropySource: TEST_ENTROPY_SOURCE,
          groupIndex: index,
        }),
      );

      await Promise.all(promises);

      // All operations should complete
      expect(tracker.startLog).toHaveLength(4);
      expect(tracker.endLog).toHaveLength(4);

      // With maxConcurrency=2, never more than 2 should run concurrently
      expect(tracker.maxActiveCount).toBe(2);

      // First 2 should start immediately, next 2 should wait
      expect(tracker.startLog.slice(0, 2).sort()).toStrictEqual([0, 1]);
    });

    it('does not throttle when maxConcurrency is Infinity', async () => {
      const { provider, tracker } = setup({ maxConcurrency: Infinity }); // No throttling

      // Start 4 concurrent calls
      const promises = [0, 1, 2, 3].map((index) =>
        provider.createAccounts({
          entropySource: TEST_ENTROPY_SOURCE,
          groupIndex: index,
        }),
      );

      await Promise.all(promises);

      // All 4 operations should complete
      expect(tracker.startLog).toHaveLength(4);

      // With no throttling, all 4 should have been able to run concurrently
      expect(tracker.maxActiveCount).toBe(4);
    });

    it('respects concurrency limit across multiple calls', async () => {
      const { provider, tracker } = setup({ maxConcurrency: 1 }); // Only 1 concurrent operation

      // Start 3 concurrent calls
      const promises = [0, 1, 2].map((index) =>
        provider.createAccounts({
          entropySource: TEST_ENTROPY_SOURCE,
          groupIndex: index,
        }),
      );

      await Promise.all(promises);

      // Verify all completed
      expect(tracker.endLog).toHaveLength(3);

      // With maxConcurrency=1, never more than 1 should run at a time
      expect(tracker.maxActiveCount).toBe(1);
    });

    it('defaults to Infinity when maxConcurrency is not provided', async () => {
      const { provider, tracker } = setup();

      // Start 4 concurrent calls
      const promises = [0, 1, 2, 3].map((index) =>
        provider.createAccounts({
          entropySource: TEST_ENTROPY_SOURCE,
          groupIndex: index,
        }),
      );

      await Promise.all(promises);

      // All 4 operations should complete
      expect(tracker.startLog).toHaveLength(4);

      // Without maxConcurrency specified, should default to Infinity (no throttling)
      // So all 4 should have been able to run concurrently
      expect(tracker.maxActiveCount).toBe(4);
    });
  });

  describe('resyncAccounts', () => {
    const mockAccounts = [
      MockAccountBuilder.from(MOCK_HD_ACCOUNT_1)
        .withUuid()
        .withSnapId(TEST_SNAP_ID)
        .get(),
      MockAccountBuilder.from(MOCK_HD_ACCOUNT_2)
        .withUuid()
        .withSnapId(TEST_SNAP_ID)
        .get(),
    ].filter(isBip44Account);

    it('does not create any accounts if already in-sync', async () => {
      const { provider } = setup({ accounts: mockAccounts });

      const createAccountsSpy = jest.spyOn(provider, 'createAccounts');

      await provider.resyncAccounts(mockAccounts);

      expect(createAccountsSpy).not.toHaveBeenCalled();
    });

    it('creates new accounts if de-synced', async () => {
      const { provider, messenger } = setup({
        accounts: [mockAccounts[0]],
      });

      const captureExceptionSpy = jest.spyOn(messenger, 'captureException');
      const createAccountsSpy = jest.spyOn(provider, 'createAccounts');

      await provider.resyncAccounts(mockAccounts);

      expect(captureExceptionSpy).toHaveBeenCalledWith(
        new Error(
          `Snap "${TEST_SNAP_ID}" has de-synced accounts, we'll attempt to re-sync them...`,
        ),
      );

      const desyncedAccount = mockAccounts[1];
      expect(createAccountsSpy).toHaveBeenCalledWith({
        entropySource: desyncedAccount.options.entropy.id,
        groupIndex: desyncedAccount.options.entropy.groupIndex,
      });
    });

    it('deletes extra Snap accounts when Snap has more accounts than MetaMask', async () => {
      const { provider, mocks } = setup({ accounts: mockAccounts });

      // Snap has both accounts, but MetaMask only has the first one
      await provider.resyncAccounts([mockAccounts[0]]);

      // deleteAccount should be called for the extra account in the Snap
      expect(
        mocks.SnapController.handleKeyringRequest.deleteAccount,
      ).toHaveBeenCalledTimes(1);
      expect(
        mocks.SnapController.handleKeyringRequest.deleteAccount,
      ).toHaveBeenCalledWith(mockAccounts[1].id);
    });

    it('handles deleteAccount errors gracefully when recovering de-synced accounts', async () => {
      const { provider, messenger, mocks } = setup({ accounts: mockAccounts });

      const captureExceptionSpy = jest.spyOn(messenger, 'captureException');
      const deleteError = new Error('Failed to delete account');
      mocks.SnapController.handleKeyringRequest.deleteAccount.mockRejectedValue(
        deleteError,
      );

      // Snap has both accounts, but MetaMask only has the first one
      await provider.resyncAccounts([mockAccounts[0]]);

      // Should have attempted to delete the extra account
      expect(
        mocks.SnapController.handleKeyringRequest.deleteAccount,
      ).toHaveBeenCalledWith(mockAccounts[1].id);

      // Should capture the deletion error but not throw
      expect(captureExceptionSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          message: `Unable to delete de-synced Snap account: ${TEST_SNAP_ID}`,
          cause: deleteError,
        }),
      );
    });

    it('does not delete accounts that exist in both Snap and MetaMask', async () => {
      const { provider, mocks } = setup({ accounts: mockAccounts });

      // Both accounts exist in both Snap and MetaMask
      await provider.resyncAccounts(mockAccounts);

      // deleteAccount should not be called since accounts are in sync
      expect(
        mocks.SnapController.handleKeyringRequest.deleteAccount,
      ).not.toHaveBeenCalled();
    });

    it('handles bidirectional de-sync by deleting extra Snap accounts and recreating missing ones', async () => {
      // Create extra accounts that only exist in the Snap
      const extraSnapAccount1 = MockAccountBuilder.from(MOCK_HD_ACCOUNT_1)
        .withUuid()
        .withSnapId(TEST_SNAP_ID)
        .get();
      const extraSnapAccount2 = MockAccountBuilder.from(MOCK_HD_ACCOUNT_2)
        .withUuid()
        .withSnapId(TEST_SNAP_ID)
        .get();

      // Snap has: [mockAccounts[0], extraSnapAccount1, extraSnapAccount2] (3 accounts)
      // MetaMask has: [mockAccounts[0], mockAccounts[1]] (2 accounts)
      // First condition (2 < 3): delete extraSnapAccount1 and extraSnapAccount2 from Snap
      // After deletion: snapAccounts.size = 1, so second condition (2 > 1) triggers
      // Second condition: recreate mockAccounts[1] in Snap
      const { provider, messenger, mocks, keyring } = setup({
        accounts: [mockAccounts[0], extraSnapAccount1, extraSnapAccount2],
      });

      const captureExceptionSpy = jest.spyOn(messenger, 'captureException');
      const createAccountsSpy = jest.spyOn(provider, 'createAccounts');

      await provider.resyncAccounts(mockAccounts);

      // Should delete the extra Snap accounts
      expect(
        mocks.SnapController.handleKeyringRequest.deleteAccount,
      ).toHaveBeenCalledTimes(2);
      expect(
        mocks.SnapController.handleKeyringRequest.deleteAccount,
      ).toHaveBeenCalledWith(extraSnapAccount1.id);
      expect(
        mocks.SnapController.handleKeyringRequest.deleteAccount,
      ).toHaveBeenCalledWith(extraSnapAccount2.id);

      // Should log the re-sync attempt for the second recovery path
      expect(captureExceptionSpy).toHaveBeenCalledWith(
        new Error(
          `Snap "${TEST_SNAP_ID}" has de-synced accounts, we'll attempt to re-sync them...`,
        ),
      );

      // Should remove from keyring and recreate the missing account
      expect(keyring.removeAccount).toHaveBeenCalledWith(
        mockAccounts[1].address,
      );
      expect(createAccountsSpy).toHaveBeenCalledWith({
        entropySource: mockAccounts[1].options.entropy.id,
        groupIndex: mockAccounts[1].options.entropy.groupIndex,
      });
    });

    it('does not throw errors if any provider is not able to re-sync', async () => {
      const { provider, messenger } = setup({ accounts: [mockAccounts[0]] });

      const captureExceptionSpy = jest.spyOn(messenger, 'captureException');
      const createAccountsSpy = jest.spyOn(provider, 'createAccounts');

      const providerError = new Error('Unable to create accounts');
      createAccountsSpy.mockRejectedValue(providerError);

      await provider.resyncAccounts(mockAccounts);

      expect(createAccountsSpy).toHaveBeenCalled();

      expect(captureExceptionSpy).toHaveBeenNthCalledWith(
        1,
        new Error(
          `Snap "${TEST_SNAP_ID}" has de-synced accounts, we'll attempt to re-sync them...`,
        ),
      );
      expect(captureExceptionSpy).toHaveBeenNthCalledWith(
        2,
        new Error('Unable to re-sync account: 0'),
      );
      expect(captureExceptionSpy.mock.lastCall[0]).toHaveProperty(
        'cause',
        providerError,
      );
    });
  });

  describe('ensureCanUseSnapPlatform', () => {
    it('delegates Snap platform readiness check to SnapPlatformWatcher', async () => {
      const { provider, mocks } = setup();

      await provider.ensureCanUseSnapPlatform();

      expect(
        mocks.MultichainAccountService.ensureCanUseSnapPlatform,
      ).toHaveBeenCalledTimes(1);
    });
  });
});
