import { backupAndSyncLogger } from '../../logger';
import type { AtomicSyncEvent, BackupAndSyncContext } from '../types';

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
   * Backup and sync context.
   */
  readonly #context: BackupAndSyncContext;

  constructor(context: BackupAndSyncContext) {
    this.#context = context;
  }

  /**
   * Enqueues an atomic sync function for processing.
   *
   * @param syncFunction - The sync function to enqueue.
   */
  enqueue(syncFunction: () => Promise<void>): void {
    // Block enqueueing if big sync is running or if no initial sync has occurred
    if (
      this.#context.controller.state.isAccountTreeSyncingInProgress ||
      !this.#context.controller.state.hasAccountTreeSyncingSyncedAtLeastOnce
    ) {
      return;
    }

    const syncEvent: AtomicSyncEvent = {
      execute: syncFunction,
    };

    this.#queue.push(syncEvent);

    // Process queue asynchronously without blocking
    setTimeout(() => {
      this.process().catch((error) => {
        backupAndSyncLogger('Error processing atomic sync queue:', error);
      });
    }, 0);
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
