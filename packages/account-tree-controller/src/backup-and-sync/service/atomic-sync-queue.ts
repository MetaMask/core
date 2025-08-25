import type { AtomicSyncEvent } from '../types';
import { contextualLogger } from '../utils';

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
   * Debug logging configuration function.
   */
  readonly #getEnableDebugLogging: () => boolean;

  constructor(getEnableDebugLogging: () => boolean = () => false) {
    this.#getEnableDebugLogging = getEnableDebugLogging;
  }

  /**
   * Enqueues an atomic sync function for processing.
   *
   * @param syncFunction - The sync function to enqueue.
   * @param isBigSyncInProgress - Whether big sync is currently running.
   */
  enqueue(
    syncFunction: () => Promise<void>,
    isBigSyncInProgress: boolean,
  ): void {
    // Block enqueueing if big sync is running
    if (isBigSyncInProgress) {
      return;
    }

    const syncEvent: AtomicSyncEvent = {
      id: `sync-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      execute: syncFunction,
    };

    this.#queue.push(syncEvent);

    // Process queue asynchronously without blocking
    setTimeout(() => {
      this.process().catch((error) => {
        if (this.#getEnableDebugLogging()) {
          contextualLogger.error('Error processing atomic sync queue:', error);
        }
      });
    }, 0);
  }

  /**
   * Processes the atomic sync queue.
   *
   * @param isBigSyncInProgress - Whether big sync is currently running.
   */
  async process(isBigSyncInProgress = false): Promise<void> {
    if (this.#isProcessingInProgress || isBigSyncInProgress) {
      return;
    }

    if (this.#queue.length === 0) {
      return;
    }

    this.#isProcessingInProgress = true;

    try {
      while (this.#queue.length > 0) {
        const event = this.#queue.shift();
        if (!event) {
          break;
        }

        try {
          await event.execute();
        } catch (error) {
          if (this.#getEnableDebugLogging()) {
            contextualLogger.error(
              `Failed to process atomic sync event ${event.id}`,
              error,
            );
          }
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
