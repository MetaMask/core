import type { Bip44Account } from '@metamask/account-api';
import type { EntropySourceId, KeyringAccount } from '@metamask/keyring-api';
import type { SnapId } from '@metamask/snaps-sdk';

import {
  isSnapAccountProvider,
  SnapAccountProvider,
} from './SnapAccountProvider';
import { SolAccountProvider } from './SolAccountProvider';
import {
  getMultichainAccountServiceMessenger,
  getRootMessenger,
} from '../tests';
import type { MultichainAccountServiceMessenger } from '../types';

const THROTTLED_OPERATION_DELAY_MS = 10;
const TEST_SNAP_ID = 'npm:@metamask/test-snap' as SnapId;
const TEST_ENTROPY_SOURCE = 'test-entropy-source' as EntropySourceId;

// Helper to create a tracked provider that monitors concurrent execution
const createTrackedProvider = (maxConcurrency?: number) => {
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

  class TrackedProvider extends SnapAccountProvider {
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

  const messenger = getMultichainAccountServiceMessenger(getRootMessenger());
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
  const provider = new TrackedProvider(TEST_SNAP_ID, messenger, config);

  return { provider, tracker };
};

describe('SnapAccountProvider', () => {
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

  describe('withMaxConcurrency', () => {
    afterEach(() => {
      jest.clearAllTimers();
      jest.useRealTimers();
    });

    it('throttles createAccounts when maxConcurrency is finite', async () => {
      const { provider, tracker } = createTrackedProvider(2); // Allow only 2 concurrent operations

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
      const { provider, tracker } = createTrackedProvider(Infinity); // No throttling

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
      const { provider, tracker } = createTrackedProvider(1); // Only 1 concurrent operation

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
      const { provider, tracker } = createTrackedProvider();

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
});
