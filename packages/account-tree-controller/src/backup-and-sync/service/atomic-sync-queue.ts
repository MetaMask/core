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
   * @param options - Configuration options.
   * @param options.await - If true, returns a Promise that resolves when the sync completes.
   * @returns A Promise if await is true, otherwise void.
   */
  clearAndEnqueue<T extends boolean = false>(
    syncFunction: () => Promise<void>,
    options?: { await?: T },
  ): T extends true ? Promise<void> : void {
    this.clear();
    return this.enqueue(syncFunction, options);
  }

  /**
   * Enqueues an atomic sync function for processing.
   *
   * @param syncFunction - The sync function to enqueue.
   * @param options - Configuration options.
   * @param options.await - If true, returns a Promise that resolves when the sync function completes.
   * @returns A Promise if await is true, otherwise void.
   */
  enqueue<T extends boolean = false>(
    syncFunction: () => Promise<void>,
    options?: { await?: T },
  ): T extends true ? Promise<void> : void {
    const shouldAwait = options?.await;
    let resolvePromise: (() => void) | undefined;
    let rejectPromise: ((error: unknown) => void) | undefined;

    // Create promise handlers if awaiting
    const promise = shouldAwait
      ? new Promise<void>((resolve, reject) => {
          resolvePromise = resolve;
          rejectPromise = reject;
        })
      : undefined;

    // Create the sync function, wrapping with promise handlers if needed
    const syncEvent: AtomicSyncEvent = {
      execute: shouldAwait
        ? async () => {
            try {
              await syncFunction();
              resolvePromise?.();
            } catch (error) {
              rejectPromise?.(error);
            }
          }
        : syncFunction,
    };

    // Add to queue and start processing
    this.#queue.push(syncEvent);
    setTimeout(() => {
      this.process().catch((error) => {
        backupAndSyncLogger('Error processing atomic sync queue:', error);
      });
    }, 0);

    // Return promise if awaiting, otherwise void
    return (shouldAwait ? promise : undefined) as T extends true
      ? Promise<void>
      : void;
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

        try {
          await event.execute();
        } catch (error) {
          backupAndSyncLogger('Failed to process atomic sync event', error);
        }
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
