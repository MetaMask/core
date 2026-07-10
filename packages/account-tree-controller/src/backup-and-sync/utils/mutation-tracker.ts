import type { SyncMutationTracker } from '../types';

/**
 * Creates a tracker that records whether the current full sync run performed a
 * real write.
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
