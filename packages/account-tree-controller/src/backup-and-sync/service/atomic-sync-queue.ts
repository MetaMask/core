import { backupAndSyncLogger } from '../../logger';
import type { AtomicSyncEvent } from '../types';

/**
 * Manages atomic sync operations in a queue to prevent concurrent execution
 * and ensure proper ordering of sync events.
 */
export class AtomicSyncQueue {
  /**
   * Queue for atomic sync events that need to be processed asynchronously.
   */
  readonly #queue: AtomicSyncEvent[] = [];

  /**
   * Flag to prevent multiple queue processing operations from running concurrently.
   */
  #isProcessingInProgress = false;

  /**
   * Clears the queue and enqueues a new sync function.
   *
   * @param syncFunction - The sync function to enqueue.
   * @returns A Promise that resolves when the sync function completes.
   */
  clearAndEnqueue(syncFunction: () => Promise<void>): Promise<void> {
    this.clear();
    return this.enqueue(syncFunction);
  }

  /**
   * Enqueues an atomic sync function for processing.
   *
   * @param syncFunction - The sync function to enqueue.
   * @returns A Promise that resolves when the sync function completes.
   */
  enqueue(syncFunction: () => Promise<void>): Promise<void> {
    let resolvePromise: (() => void) | undefined;
    let rejectPromise: ((error: unknown) => void) | undefined;

    // Create promise that resolves when the sync function completes
    const promise = new Promise<void>((resolve, reject) => {
      resolvePromise = resolve;
      rejectPromise = reject;
    });

    // Create the sync event with promise handlers
    const syncEvent: AtomicSyncEvent = {
      execute: async () => {
        try {
          await syncFunction();
          resolvePromise?.();
        } catch (error) {
          rejectPromise?.(error);
        }
      },
    };

    // Add to queue and start processing
    this.#queue.push(syncEvent);
    setTimeout(() => {
      this.process().catch((error) => {
        backupAndSyncLogger('Error processing atomic sync queue:', error);
      });
    }, 0);

    return promise;
  }

  /**
   * Processes the atomic sync queue.
   */
  async process(): Promise<void> {
    if (this.#isProcessingInProgress) {
      return;
    }

    if (this.#queue.length === 0) {
      return;
    }

    this.#isProcessingInProgress = true;

    try {
      while (this.#queue.length > 0) {
        const event = this.#queue.shift();
        /* istanbul ignore next */
        if (!event) {
          break;
        }

        await event.execute();
      }
    } finally {
      this.#isProcessingInProgress = false;
    }
  }

  /**
   * Clears all pending sync events from the queue.
   * Useful when big sync starts to prevent stale updates.
   */
  clear(): void {
    this.#queue.length = 0;
  }

  /**
   * Gets the current queue size.
   *
   * @returns The number of pending sync events.
   */
  get size(): number {
    return this.#queue.length;
  }

  /**
   * Checks if queue processing is currently in progress.
   *
   * @returns True if processing is in progress.
   */
  get isProcessing(): boolean {
    return this.#isProcessingInProgress;
  }
}
