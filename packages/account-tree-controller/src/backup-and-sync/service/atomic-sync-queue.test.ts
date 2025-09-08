import { AtomicSyncQueue } from './atomic-sync-queue';
import type { BackupAndSyncContext } from '../types';
import { createMockContextualLogger } from '../utils/test-utils';

describe('BackupAndSync - Service - AtomicSyncQueue', () => {
  let atomicSyncQueue: AtomicSyncQueue;
  const mockContext = {
    controller: {
      state: {
        isAccountTreeSyncingInProgress: false,
        hasAccountTreeSyncingSyncedAtLeastOnce: true,
      },
    },
    contextualLogger: createMockContextualLogger({
      isEnabled: true,
    }),
  } as unknown as BackupAndSyncContext;

  beforeEach(() => {
    jest.clearAllMocks();
    atomicSyncQueue = new AtomicSyncQueue(mockContext);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('constructor', () => {
    it('initializes with default debug logging function', () => {
      const queue = new AtomicSyncQueue(mockContext);
      expect(queue.size).toBe(0);
      expect(queue.isProcessing).toBe(false);
    });

    it('initializes with provided debug logging function', () => {
      const queue = new AtomicSyncQueue(mockContext);
      expect(queue.size).toBe(0);
      expect(queue.isProcessing).toBe(false);
    });
  });

  describe('enqueue', () => {
    it('enqueues sync function when big sync is not in progress', () => {
      const mockSyncFunction = jest.fn().mockResolvedValue(undefined);

      atomicSyncQueue.enqueue(mockSyncFunction);

      expect(atomicSyncQueue.size).toBe(1);
    });

    it('does not enqueue when big sync is in progress', () => {
      const mockContextWithBigSyncInProgress = {
        ...mockContext,
        controller: {
          ...mockContext.controller,
          state: {
            ...mockContext.controller.state,
            isAccountTreeSyncingInProgress: true,
          },
        },
      } as unknown as BackupAndSyncContext;

      const atomicSyncQueueWithBigSyncInProgress = new AtomicSyncQueue(
        mockContextWithBigSyncInProgress,
      );

      const mockSyncFunction = jest.fn().mockResolvedValue(undefined);

      atomicSyncQueueWithBigSyncInProgress.enqueue(mockSyncFunction);

      expect(atomicSyncQueueWithBigSyncInProgress.size).toBe(0);
    });

    it('does not enqueue if big sync has never been ran', () => {
      const mockContextWithNoBigSyncEver = {
        ...mockContext,
        controller: {
          ...mockContext.controller,
          state: {
            ...mockContext.controller.state,
            hasAccountTreeSyncingSyncedAtLeastOnce: false,
          },
        },
      } as unknown as BackupAndSyncContext;

      const atomicSyncQueueWithNoBigSyncEver = new AtomicSyncQueue(
        mockContextWithNoBigSyncEver,
      );

      const mockSyncFunction = jest.fn().mockResolvedValue(undefined);

      atomicSyncQueueWithNoBigSyncEver.enqueue(mockSyncFunction);

      expect(atomicSyncQueueWithNoBigSyncEver.size).toBe(0);
    });

    it('triggers async processing after enqueueing', async () => {
      jest.useFakeTimers();
      const mockSyncFunction = jest.fn().mockResolvedValue(undefined);

      atomicSyncQueue.enqueue(mockSyncFunction);

      expect(atomicSyncQueue.size).toBe(1);

      // Fast-forward timers to trigger async processing
      jest.advanceTimersByTime(1);
      await Promise.resolve(); // Let promises resolve

      expect(mockSyncFunction).toHaveBeenCalled();
      expect(atomicSyncQueue.size).toBe(0);
    });
  });

  describe('process', () => {
    it('processes queued sync functions', async () => {
      const mockSyncFunction1 = jest.fn().mockResolvedValue(undefined);
      const mockSyncFunction2 = jest.fn().mockResolvedValue(undefined);

      atomicSyncQueue.enqueue(mockSyncFunction1);
      atomicSyncQueue.enqueue(mockSyncFunction2);

      await atomicSyncQueue.process();

      expect(mockSyncFunction1).toHaveBeenCalled();
      expect(mockSyncFunction2).toHaveBeenCalled();
      expect(atomicSyncQueue.size).toBe(0);
    });

    it('does not process when big sync is in progress', async () => {
      const mockContextWithBigSyncInProgress = {
        ...mockContext,
        controller: {
          ...mockContext.controller,
          state: {
            ...mockContext.controller.state,
            isAccountTreeSyncingInProgress: true,
          },
        },
      } as unknown as BackupAndSyncContext;

      const atomicSyncQueueWithBigSyncInProgress = new AtomicSyncQueue(
        mockContextWithBigSyncInProgress,
      );

      const mockSyncFunction = jest.fn().mockResolvedValue(undefined);

      atomicSyncQueueWithBigSyncInProgress.enqueue(mockSyncFunction);

      await atomicSyncQueueWithBigSyncInProgress.process();

      expect(mockSyncFunction).not.toHaveBeenCalled();
      expect(atomicSyncQueueWithBigSyncInProgress.size).toBe(0);
    });

    it('does not process when already processing', async () => {
      const mockSyncFunction = jest.fn().mockImplementation(async () => {
        // While first function is processing, try to process again
        await atomicSyncQueue.process();
      });

      atomicSyncQueue.enqueue(mockSyncFunction);

      await atomicSyncQueue.process();

      expect(mockSyncFunction).toHaveBeenCalledTimes(1);
    });

    it('handles sync function errors gracefully', async () => {
      const error = new Error('Sync function failed');
      const mockSyncFunction1 = jest.fn().mockRejectedValue(error);
      const mockSyncFunction2 = jest.fn().mockResolvedValue(undefined);

      atomicSyncQueue.enqueue(mockSyncFunction1);
      atomicSyncQueue.enqueue(mockSyncFunction2);

      await atomicSyncQueue.process();

      expect(mockSyncFunction1).toHaveBeenCalled();
      expect(mockSyncFunction2).toHaveBeenCalled();
      expect(mockContext.contextualLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('Failed to process atomic sync event'),
        error,
      );
      expect(atomicSyncQueue.size).toBe(0);
    });

    it('returns early when queue is empty', async () => {
      await atomicSyncQueue.process();

      expect(atomicSyncQueue.size).toBe(0);
      expect(atomicSyncQueue.isProcessing).toBe(false);
    });
  });

  describe('clear', () => {
    it('clears all queued sync events', () => {
      const mockSyncFunction1 = jest.fn().mockResolvedValue(undefined);
      const mockSyncFunction2 = jest.fn().mockResolvedValue(undefined);

      atomicSyncQueue.enqueue(mockSyncFunction1);
      atomicSyncQueue.enqueue(mockSyncFunction2);

      expect(atomicSyncQueue.size).toBe(2);

      atomicSyncQueue.clear();

      expect(atomicSyncQueue.size).toBe(0);
    });
  });

  describe('properties', () => {
    it('returns correct queue size', () => {
      expect(atomicSyncQueue.size).toBe(0);

      atomicSyncQueue.enqueue(jest.fn());
      expect(atomicSyncQueue.size).toBe(1);

      atomicSyncQueue.enqueue(jest.fn());
      expect(atomicSyncQueue.size).toBe(2);
    });

    it('returns correct processing status', async () => {
      expect(atomicSyncQueue.isProcessing).toBe(false);

      const slowSyncFunction = jest.fn().mockImplementation(async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
      });

      atomicSyncQueue.enqueue(slowSyncFunction);

      const processPromise = atomicSyncQueue.process();

      // Should be processing now
      await new Promise((resolve) => setTimeout(resolve, 10));
      expect(atomicSyncQueue.isProcessing).toBe(true);

      await processPromise;
      expect(atomicSyncQueue.isProcessing).toBe(false);
    });

    it('accesses size property correctly', () => {
      // Create a fresh queue to test size property
      const freshQueue = new AtomicSyncQueue(mockContext);
      expect(freshQueue.size).toBe(0);

      // Add multiple items
      freshQueue.enqueue(jest.fn());
      freshQueue.enqueue(jest.fn());
      freshQueue.enqueue(jest.fn());

      expect(freshQueue.size).toBe(3);

      // Clear and verify
      freshQueue.clear();
      expect(freshQueue.size).toBe(0);
    });
  });

  describe('error handling in async processing', () => {
    it('handles errors in async process call', async () => {
      jest.useFakeTimers();

      const error = new Error('Process error');
      jest.spyOn(atomicSyncQueue, 'process').mockRejectedValueOnce(error);

      const mockSyncFunction = jest.fn().mockResolvedValue(undefined);
      atomicSyncQueue.enqueue(mockSyncFunction);

      jest.advanceTimersByTime(1);
      await Promise.resolve();

      expect(mockContext.contextualLogger.error).toHaveBeenCalledWith(
        'Error processing atomic sync queue:',
        error,
      );
    });

    it('covers debug logging in async process catch', async () => {
      // Use real timers for this test to avoid timing issues
      jest.useRealTimers();

      // Create a custom class that will throw in process() to test the catch block in enqueue
      class TestAtomicSyncQueue extends AtomicSyncQueue {
        async process(): Promise<void> {
          throw new Error('New error');
        }
      }

      // Create a queue with debug logging enabled
      const debugEnabledQueue = new TestAtomicSyncQueue(mockContext);

      const mockSyncFunction = jest.fn().mockResolvedValue(undefined);
      debugEnabledQueue.enqueue(mockSyncFunction);

      // Wait for the setTimeout callback to execute and the error to be caught
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(mockContext.contextualLogger.error).toHaveBeenCalledWith(
        'Error processing atomic sync queue:',
        expect.objectContaining({ message: 'New error' }),
      );
    });

    it('covers debug logging when sync function fails', async () => {
      // Create a queue with debug logging enabled
      const debugEnabledQueue = new AtomicSyncQueue(mockContext);

      // Create a sync function that throws an error
      const syncError = new Error('New error 2');
      const failingSyncFunction = jest.fn().mockRejectedValue(syncError);

      // Enqueue the failing function
      debugEnabledQueue.enqueue(failingSyncFunction);

      // Process the queue
      await debugEnabledQueue.process();

      expect(mockContext.contextualLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('Failed to process atomic sync event'),
        syncError,
      );
    });

    it('handles empty queue after shift operation', async () => {
      // Test the scenario where shift() might return undefined/null
      // This can happen in race conditions or edge cases
      const mockSyncFunction1 = jest.fn().mockResolvedValue(undefined);
      const mockSyncFunction2 = jest.fn().mockResolvedValue(undefined);

      atomicSyncQueue.enqueue(mockSyncFunction1);
      atomicSyncQueue.enqueue(mockSyncFunction2);

      // Process concurrently to potentially create race conditions
      const promise1 = atomicSyncQueue.process();
      const promise2 = atomicSyncQueue.process();

      await Promise.all([promise1, promise2]);

      expect(atomicSyncQueue.size).toBe(0);
      expect(atomicSyncQueue.isProcessing).toBe(false);
    });
  });
});
