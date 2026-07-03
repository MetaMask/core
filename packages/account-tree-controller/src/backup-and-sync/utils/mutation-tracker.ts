import type { SyncMutationTracker } from '../types';

/**
 * Creates a tracker that records whether the current full sync run performed a
 * real write. Remote writes (pushes to user storage) are durable; local writes
 * can be reverted by a per-wallet rollback. Runs are serialized, so a single
 * tracker is reset at the start of each run.
 *
 * @returns A fresh mutation tracker.
 */
export const createSyncMutationTracker = (): SyncMutationTracker => {
  let remoteWrite = false;
  let localWrite = false;
  return {
    setRemoteWrite: (value: boolean): void => {
      remoteWrite = value;
    },
    getLocalWrite: (): boolean => localWrite,
    setLocalWrite: (value: boolean): void => {
      localWrite = value;
    },
    hasOccurred: (): boolean => remoteWrite || localWrite,
    reset: (): void => {
      remoteWrite = false;
      localWrite = false;
    },
  };
};
