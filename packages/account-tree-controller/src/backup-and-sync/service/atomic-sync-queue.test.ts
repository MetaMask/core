import { AtomicSyncQueue } from './atomic-sync-queue';
import { backupAndSyncLogger } from '../../logger';

jest.mock('../../logger', () => ({
  backupAndSyncLogger: jest.fn(),
}));

const mockBackupAndSyncLogger = backupAndSyncLogger as jest.MockedFunction<
  typeof backupAndSyncLogger
>;

describe('BackupAndSync - Service - AtomicSyncQueue', () => {
  let atomicSyncQueue: AtomicSyncQueue;

  beforeEach(() => {
    jest.clearAllMocks();
    atomicSyncQueue = new AtomicSyncQueue();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('constructor', () => {
    it('initializes with default debug logging function', () => {
      const queue = new AtomicSyncQueue();
      expect(queue.size).toBe(0);
      expect(queue.isProcessing).toBe(false);
    });

    it('initializes with provided debug logging function', () => {
      const queue = new AtomicSyncQueue();
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
      const freshQueue = new AtomicSyncQueue();
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

      expect(mockBackupAndSyncLogger).toHaveBeenCalledWith(
        'Error processing atomic sync queue:',
        error,
      );
    });

    it('rejects promise when awaited sync function throws error', async () => {
      const error = new Error('Sync function failed');
      const mockSyncFunction = jest.fn().mockRejectedValue(error);

      const promise = atomicSyncQueue.enqueue(mockSyncFunction, {
        await: true,
      });

      await expect(promise).rejects.toThrow('Sync function failed');
      expect(mockSyncFunction).toHaveBeenCalled();
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
