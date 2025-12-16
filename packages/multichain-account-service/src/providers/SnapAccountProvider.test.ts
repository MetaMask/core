import { isBip44Account } from '@metamask/account-api';
import type { Bip44Account } from '@metamask/account-api';
import type { TraceCallback, TraceRequest } from '@metamask/controller-utils';
import type { EntropySourceId, KeyringAccount } from '@metamask/keyring-api';
import type { InternalAccount } from '@metamask/keyring-internal-api';
import type { SnapId } from '@metamask/snaps-sdk';

import { BtcAccountProvider } from './BtcAccountProvider';
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

// Helper to create a test provider that exposes protected trace method
class TestSnapAccountProvider extends SnapAccountProvider {
  getName(): string {
    return 'Test Provider';
  }

  isAccountCompatible(_account: Bip44Account<InternalAccount>): boolean {
    return true;
  }

  async discoverAccounts(_options: {
    entropySource: EntropySourceId;
    groupIndex: number;
  }): Promise<Bip44Account<KeyringAccount>[]> {
    return [];
  }

  async createAccounts(_options: {
    entropySource: EntropySourceId;
    groupIndex: number;
  }): Promise<Bip44Account<KeyringAccount>[]> {
    return [];
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
}: { maxConcurrency?: number; messenger?: RootMessenger } = {}) => {
  const tracker: {
    startLog: number[];
    endLog: number[];
    activeCount: number;
    maxActiveCount: number;
  } = {
    startLog: [],
    endLog: [],
    activeCount: 0,
    maxActiveCount: 0,
  };

  class MockSnapAccountProvider extends SnapAccountProvider {
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
  }

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

  const serviceMessenger = getMultichainAccountServiceMessenger(messenger);
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

  return { messenger, provider, tracker, keyring };
};

describe('SnapAccountProvider', () => {
  describe('constructor default parameters', () => {
    const mockMessenger = {
      call: jest.fn().mockResolvedValue({}),
      registerActionHandler: jest.fn(),
      subscribe: jest.fn(),
      registerMethodActionHandlers: jest.fn(),
      unregisterActionHandler: jest.fn(),
      registerInitialEventPayload: jest.fn(),
      publish: jest.fn(),
      clearEventSubscriptions: jest.fn(),
    } as unknown as MultichainAccountServiceMessenger;

    beforeEach(() => {
      jest.clearAllMocks();
    });

    it('creates SolAccountProvider with default trace using 1 parameter', () => {
      const provider = new SolAccountProvider(mockMessenger);
      expect(provider).toBeDefined();
      expect(provider.snapId).toBe(SolAccountProvider.SOLANA_SNAP_ID);
    });

    it('creates SolAccountProvider with default trace using 2 parameters', () => {
      const provider = new SolAccountProvider(mockMessenger, undefined);
      expect(provider).toBeDefined();
      expect(provider.snapId).toBe(SolAccountProvider.SOLANA_SNAP_ID);
    });

    it('creates SolAccountProvider with custom trace using 3 parameters', () => {
      const customTrace = jest.fn();
      const provider = new SolAccountProvider(
        mockMessenger,
        undefined,
        customTrace,
      );
      expect(provider).toBeDefined();
      expect(provider.snapId).toBe(SolAccountProvider.SOLANA_SNAP_ID);
    });

    it('creates SolAccountProvider with custom config and default trace', () => {
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
      const provider = new SolAccountProvider(mockMessenger, customConfig);
      expect(provider).toBeDefined();
      expect(provider.snapId).toBe(SolAccountProvider.SOLANA_SNAP_ID);
    });

    it('creates BtcAccountProvider with default trace', () => {
      // Test other subclasses to ensure branch coverage
      const btcProvider = new BtcAccountProvider(mockMessenger);

      expect(btcProvider).toBeDefined();
      expect(isSnapAccountProvider(btcProvider)).toBe(true);
    });

    it('creates TrxAccountProvider with custom trace', () => {
      const customTrace = jest.fn();

      // Explicitly test with all three parameters
      const trxProvider = new TrxAccountProvider(
        mockMessenger,
        undefined,
        customTrace,
      );

      expect(trxProvider).toBeDefined();
      expect(isSnapAccountProvider(trxProvider)).toBe(true);
    });

    it('creates provider without trace parameter', () => {
      // Test creating provider without passing trace parameter
      const provider = new SolAccountProvider(mockMessenger, undefined);

      expect(provider).toBeDefined();
    });

    it('tests parameter spreading to trigger branch coverage', () => {
      type SolConfig = ConstructorParameters<typeof SolAccountProvider>[1];
      type ProviderArgs = [
        MultichainAccountServiceMessenger,
        SolConfig?,
        TraceCallback?,
      ];
      const args: ProviderArgs = [mockMessenger];
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
      // Create a mock messenger with required methods
      const mockMessenger = {
        call: jest.fn(),
        registerActionHandler: jest.fn(),
        subscribe: jest.fn(),
        registerMethodActionHandlers: jest.fn(),
        unregisterActionHandler: jest.fn(),
        registerInitialEventPayload: jest.fn(),
        publish: jest.fn(),
        clearEventSubscriptions: jest.fn(),
      } as unknown as MultichainAccountServiceMessenger;

      const solProvider = new SolAccountProvider(mockMessenger);
      expect(isSnapAccountProvider(solProvider)).toBe(true);
    });
  });

  describe('trace functionality', () => {
    const mockMessenger = {
      call: jest.fn().mockResolvedValue({}),
      registerActionHandler: jest.fn(),
      subscribe: jest.fn(),
      registerMethodActionHandlers: jest.fn(),
      unregisterActionHandler: jest.fn(),
      registerInitialEventPayload: jest.fn(),
      publish: jest.fn(),
      clearEventSubscriptions: jest.fn(),
    } as unknown as MultichainAccountServiceMessenger;

    const traceFallbackMock = traceFallback as jest.MockedFunction<
      typeof traceFallback
    >;

    beforeEach(() => {
      jest.clearAllMocks();
      traceFallbackMock.mockClear();
    });

    it('uses default trace parameter when only messenger is provided', async () => {
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
      const testProvider = new TestSnapAccountProvider(
        TEST_SNAP_ID,
        mockMessenger,
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
      const customTrace = jest.fn().mockImplementation(async (_request, fn) => {
        return await fn();
      });

      // Test with all parameters including custom trace
      const testProvider = new TestSnapAccountProvider(
        TEST_SNAP_ID,
        mockMessenger,
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
      const testProvider = new TestSnapAccountProvider(
        TEST_SNAP_ID,
        mockMessenger,
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
      const testProvider = new TestSnapAccountProvider(
        TEST_SNAP_ID,
        mockMessenger,
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
      const testProvider = new TestSnapAccountProvider(
        TEST_SNAP_ID,
        mockMessenger,
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
      const { provider, messenger } = setup();

      messenger.registerActionHandler(
        'SnapController:handleRequest',
        jest.fn().mockResolvedValue(mockAccounts.map(asKeyringAccount)),
      );

      const createAccountsSpy = jest.spyOn(provider, 'createAccounts');

      await provider.resyncAccounts(mockAccounts);

      expect(createAccountsSpy).not.toHaveBeenCalled();
    });

    it('creates new accounts if de-synced', async () => {
      const { provider, messenger } = setup();

      messenger.registerActionHandler(
        'SnapController:handleRequest',
        jest.fn().mockResolvedValue([mockAccounts[0]].map(asKeyringAccount)),
      );

      const mockCaptureException = jest.fn();
      messenger.registerActionHandler(
        'ErrorReportingService:captureException',
        mockCaptureException,
      );

      const createAccountsSpy = jest.spyOn(provider, 'createAccounts');

      await provider.resyncAccounts(mockAccounts);

      expect(mockCaptureException).toHaveBeenCalledWith(
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

    it('reports an error if a Snap has more accounts than MetaMask', async () => {
      const { provider, messenger } = setup();

      messenger.registerActionHandler(
        'SnapController:handleRequest',
        jest.fn().mockResolvedValue(mockAccounts.map(asKeyringAccount)),
      );

      const mockCaptureException = jest.fn();
      messenger.registerActionHandler(
        'ErrorReportingService:captureException',
        mockCaptureException,
      );

      await provider.resyncAccounts([mockAccounts[0]]); // Less accounts than the Snap

      expect(mockCaptureException).toHaveBeenCalledWith(
        new Error(
          `Snap "${TEST_SNAP_ID}" has de-synced accounts, Snap has more accounts than MetaMask!`,
        ),
      );
    });

    it('does not throw errors if any provider is not able to re-sync', async () => {
      const { provider, messenger } = setup();

      messenger.registerActionHandler(
        'SnapController:handleRequest',
        jest.fn().mockResolvedValue([mockAccounts[0]].map(asKeyringAccount)),
      );

      const mockCaptureException = jest.fn();
      messenger.registerActionHandler(
        'ErrorReportingService:captureException',
        mockCaptureException,
      );

      const createAccountsSpy = jest.spyOn(provider, 'createAccounts');

      const providerError = new Error('Unable to create accounts');
      createAccountsSpy.mockRejectedValue(providerError);

      await provider.resyncAccounts(mockAccounts);

      expect(createAccountsSpy).toHaveBeenCalled();

      expect(mockCaptureException).toHaveBeenNthCalledWith(
        1,
        new Error(
          `Snap "${TEST_SNAP_ID}" has de-synced accounts, we'll attempt to re-sync them...`,
        ),
      );
      expect(mockCaptureException).toHaveBeenNthCalledWith(
        2,
        new Error('Unable to re-sync account: 0'),
      );
      expect(mockCaptureException.mock.lastCall[0]).toHaveProperty(
        'cause',
        providerError,
      );
    });
  });
});
