import { AtomicSyncQueue } from './atomic-sync-queue';
import type { BackupAndSyncContext } from '../types';
import { contextualLogger } from '../utils';

jest.mock('../utils', () => ({
  contextualLogger: {
    error: jest.fn(),
  },
}));

describe('BackupAndSync - Service - AtomicSyncQueue', () => {
  let mockGetEnableDebugLogging: jest.Mock;
  let atomicSyncQueue: AtomicSyncQueue;
  const mockContext = {
    controller: {
      state: {
        isAccountTreeSyncingInProgress: false,
        hasAccountTreeSyncingSyncedAtLeastOnce: true,
      },
    },
  } as unknown as BackupAndSyncContext;

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetEnableDebugLogging = jest.fn().mockReturnValue(false);
    atomicSyncQueue = new AtomicSyncQueue(mockGetEnableDebugLogging);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('constructor', () => {
    it('should initialize with default debug logging function', () => {
      const queue = new AtomicSyncQueue();
      expect(queue.size).toBe(0);
      expect(queue.isProcessing).toBe(false);
    });

    it('should initialize with provided debug logging function', () => {
      const queue = new AtomicSyncQueue(mockGetEnableDebugLogging);
      expect(queue.size).toBe(0);
      expect(queue.isProcessing).toBe(false);
    });

    it('covers default arrow function () => false execution', async () => {
      const defaultQueue = new AtomicSyncQueue();

      const errorSyncFunction = jest
        .fn()
        .mockRejectedValue(new Error('Trigger default function'));

      defaultQueue.enqueue(mockContext, errorSyncFunction);

      // Process to trigger the error handling which calls this.#getEnableDebugLogging()
      // This will execute the default arrow function () => false
      await defaultQueue.process();

      // Verify the sync function was called
      expect(errorSyncFunction).toHaveBeenCalled();

      // Since default function returns false, no error should be logged
      expect(contextualLogger.error).not.toHaveBeenCalled();
    });
  });

  describe('enqueue', () => {
    it('should enqueue sync function when big sync is not in progress', () => {
      const mockSyncFunction = jest.fn().mockResolvedValue(undefined);

      atomicSyncQueue.enqueue(mockContext, mockSyncFunction);

      expect(atomicSyncQueue.size).toBe(1);
    });

    it('should not enqueue when big sync is in progress', () => {
      const mockSyncFunction = jest.fn().mockResolvedValue(undefined);

      atomicSyncQueue.enqueue(
        {
          controller: {
            state: {
              ...mockContext.controller.state,
              isAccountTreeSyncingInProgress: true,
            },
          },
        } as unknown as BackupAndSyncContext,
        mockSyncFunction,
      );

      expect(atomicSyncQueue.size).toBe(0);
    });

    it('should not enqueue if big sync has never been ran', () => {
      const mockSyncFunction = jest.fn().mockResolvedValue(undefined);

      atomicSyncQueue.enqueue(
        {
          controller: {
            state: {
              ...mockContext.controller.state,
              hasAccountTreeSyncingSyncedAtLeastOnce: false,
            },
          },
        } as unknown as BackupAndSyncContext,
        mockSyncFunction,
      );

      expect(atomicSyncQueue.size).toBe(0);
    });

    it('should trigger async processing after enqueueing', async () => {
      jest.useFakeTimers();
      const mockSyncFunction = jest.fn().mockResolvedValue(undefined);

      atomicSyncQueue.enqueue(mockContext, mockSyncFunction);

      expect(atomicSyncQueue.size).toBe(1);

      // Fast-forward timers to trigger async processing
      jest.advanceTimersByTime(1);
      await Promise.resolve(); // Let promises resolve

      expect(mockSyncFunction).toHaveBeenCalled();
      expect(atomicSyncQueue.size).toBe(0);
    });
  });

  describe('process', () => {
    it('should process queued sync functions', async () => {
      const mockSyncFunction1 = jest.fn().mockResolvedValue(undefined);
      const mockSyncFunction2 = jest.fn().mockResolvedValue(undefined);

      atomicSyncQueue.enqueue(mockContext, mockSyncFunction1);
      atomicSyncQueue.enqueue(mockContext, mockSyncFunction2);

      await atomicSyncQueue.process();

      expect(mockSyncFunction1).toHaveBeenCalled();
      expect(mockSyncFunction2).toHaveBeenCalled();
      expect(atomicSyncQueue.size).toBe(0);
    });

    it('should not process when big sync is in progress', async () => {
      const mockSyncFunction = jest.fn().mockResolvedValue(undefined);

      atomicSyncQueue.enqueue(
        {
          controller: {
            state: {
              ...mockContext.controller.state,
              isAccountTreeSyncingInProgress: true,
            },
          },
        } as unknown as BackupAndSyncContext,
        mockSyncFunction,
      );

      await atomicSyncQueue.process();

      expect(mockSyncFunction).not.toHaveBeenCalled();
      expect(atomicSyncQueue.size).toBe(0);
    });

    it('should not process when already processing', async () => {
      const mockSyncFunction = jest.fn().mockImplementation(async () => {
        // While first function is processing, try to process again
        await atomicSyncQueue.process();
      });

      atomicSyncQueue.enqueue(mockContext, mockSyncFunction);

      await atomicSyncQueue.process();

      expect(mockSyncFunction).toHaveBeenCalledTimes(1);
    });

    it('should handle sync function errors gracefully', async () => {
      const error = new Error('Sync function failed');
      const mockSyncFunction1 = jest.fn().mockRejectedValue(error);
      const mockSyncFunction2 = jest.fn().mockResolvedValue(undefined);

      mockGetEnableDebugLogging.mockReturnValue(true);

      atomicSyncQueue.enqueue(mockContext, mockSyncFunction1);
      atomicSyncQueue.enqueue(mockContext, mockSyncFunction2);

      await atomicSyncQueue.process();

      expect(mockSyncFunction1).toHaveBeenCalled();
      expect(mockSyncFunction2).toHaveBeenCalled();
      expect(contextualLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('Failed to process atomic sync event'),
        error,
      );
      expect(atomicSyncQueue.size).toBe(0);
    });

    it('should return early when queue is empty', async () => {
      await atomicSyncQueue.process();

      expect(atomicSyncQueue.size).toBe(0);
      expect(atomicSyncQueue.isProcessing).toBe(false);
    });
  });

  describe('clear', () => {
    it('should clear all queued sync events', () => {
      const mockSyncFunction1 = jest.fn().mockResolvedValue(undefined);
      const mockSyncFunction2 = jest.fn().mockResolvedValue(undefined);

      atomicSyncQueue.enqueue(mockContext, mockSyncFunction1);
      atomicSyncQueue.enqueue(mockContext, mockSyncFunction2);

      expect(atomicSyncQueue.size).toBe(2);

      atomicSyncQueue.clear();

      expect(atomicSyncQueue.size).toBe(0);
    });
  });

  describe('properties', () => {
    it('should return correct queue size', () => {
      expect(atomicSyncQueue.size).toBe(0);

      atomicSyncQueue.enqueue(mockContext, jest.fn());
      expect(atomicSyncQueue.size).toBe(1);

      atomicSyncQueue.enqueue(mockContext, jest.fn());
      expect(atomicSyncQueue.size).toBe(2);
    });

    it('should return correct processing status', async () => {
      expect(atomicSyncQueue.isProcessing).toBe(false);

      const slowSyncFunction = jest.fn().mockImplementation(async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
      });

      atomicSyncQueue.enqueue(mockContext, slowSyncFunction);

      const processPromise = atomicSyncQueue.process();

      // Should be processing now
      await new Promise((resolve) => setTimeout(resolve, 10));
      expect(atomicSyncQueue.isProcessing).toBe(true);

      await processPromise;
      expect(atomicSyncQueue.isProcessing).toBe(false);
    });

    it('should access size property correctly', () => {
      // Create a fresh queue to test size property
      const freshQueue = new AtomicSyncQueue();
      expect(freshQueue.size).toBe(0);

      // Add multiple items
      freshQueue.enqueue(mockContext, jest.fn());
      freshQueue.enqueue(mockContext, jest.fn());
      freshQueue.enqueue(mockContext, jest.fn());

      expect(freshQueue.size).toBe(3);

      // Clear and verify
      freshQueue.clear();
      expect(freshQueue.size).toBe(0);
    });
  });

  describe('error handling in async processing', () => {
    it('should handle errors in async process call', async () => {
      jest.useFakeTimers();

      const error = new Error('Process error');
      jest.spyOn(atomicSyncQueue, 'process').mockRejectedValueOnce(error);
      mockGetEnableDebugLogging.mockReturnValue(true);

      const mockSyncFunction = jest.fn().mockResolvedValue(undefined);
      atomicSyncQueue.enqueue(mockContext, mockSyncFunction);

      jest.advanceTimersByTime(1);
      await Promise.resolve();

      expect(contextualLogger.error).toHaveBeenCalledWith(
        'Error processing atomic sync queue:',
        error,
      );
    });

    it('should cover debug logging in async process catch', async () => {
      // Use real timers for this test to avoid timing issues
      jest.useRealTimers();

      // Create a custom class that will throw in process() to test the catch block in enqueue
      class TestAtomicSyncQueue extends AtomicSyncQueue {
        async process(): Promise<void> {
          throw new Error('New error');
        }
      }

      // Create a queue with debug logging enabled
      const debugEnabledQueue = new TestAtomicSyncQueue(() => true);

      const mockSyncFunction = jest.fn().mockResolvedValue(undefined);
      debugEnabledQueue.enqueue(mockContext, mockSyncFunction);

      // Wait for the setTimeout callback to execute and the error to be caught
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(contextualLogger.error).toHaveBeenCalledWith(
        'Error processing atomic sync queue:',
        expect.objectContaining({ message: 'New error' }),
      );
    });

    it('should cover debug logging when sync function fails', async () => {
      // Create a queue with debug logging enabled
      const debugEnabledQueue = new AtomicSyncQueue(() => true);

      // Create a sync function that throws an error
      const syncError = new Error('New error 2');
      const failingSyncFunction = jest.fn().mockRejectedValue(syncError);

      // Enqueue the failing function
      debugEnabledQueue.enqueue(mockContext, failingSyncFunction);

      // Process the queue
      await debugEnabledQueue.process();

      expect(contextualLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('Failed to process atomic sync event'),
        syncError,
      );
    });

    it('covers debug logging branches - when debug logging is disabled', async () => {
      jest.clearAllMocks(); // Clear previous calls

      // Create a queue with debug logging DISABLED
      const debugDisabledQueue = new AtomicSyncQueue(() => false);

      // Test the setTimeout error catch with debug disabled
      class TestAtomicSyncQueue extends AtomicSyncQueue {
        async process(): Promise<void> {
          throw new Error('Should not be logged');
        }
      }

      const noDebugQueue = new TestAtomicSyncQueue(() => false);
      const mockSyncFunction = jest.fn().mockResolvedValue(undefined);
      noDebugQueue.enqueue(mockContext, mockSyncFunction);

      await new Promise((resolve) => setTimeout(resolve, 10));

      // Test sync function error with debug disabled
      const syncError = new Error('Should not be logged either');
      const failingSyncFunction = jest.fn().mockRejectedValue(syncError);
      debugDisabledQueue.enqueue(mockContext, failingSyncFunction);
      await debugDisabledQueue.process();

      // Ensure contextualLogger.error was NOT called for disabled debug cases
      expect(contextualLogger.error).not.toHaveBeenCalled();
    });

    it('should handle empty queue after shift operation', async () => {
      // Test the scenario where shift() might return undefined/null
      // This can happen in race conditions or edge cases
      const mockSyncFunction1 = jest.fn().mockResolvedValue(undefined);
      const mockSyncFunction2 = jest.fn().mockResolvedValue(undefined);

      atomicSyncQueue.enqueue(mockContext, mockSyncFunction1);
      atomicSyncQueue.enqueue(mockContext, mockSyncFunction2);

      // Process concurrently to potentially create race conditions
      const promise1 = atomicSyncQueue.process();
      const promise2 = atomicSyncQueue.process();

      await Promise.all([promise1, promise2]);

      expect(atomicSyncQueue.size).toBe(0);
      expect(atomicSyncQueue.isProcessing).toBe(false);
    });
  });
});
