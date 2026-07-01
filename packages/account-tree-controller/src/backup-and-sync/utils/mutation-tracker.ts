import type { SyncMutationTracker } from '../types';

/**
 * Creates a tracker that records whether the current full sync run performed a
 * real write (a local mutation or a remote push). Runs are serialized, so a
 * single tracker is reset at the start of each run.
 *
 * @returns A fresh mutation tracker.
 */
export const createSyncMutationTracker = (): SyncMutationTracker => {
  let occurred = false;
  return {
    markOccurred: () => {
      occurred = true;
    },
    hasOccurred: () => occurred,
    reset: () => {
      occurred = false;
    },
  };
};
