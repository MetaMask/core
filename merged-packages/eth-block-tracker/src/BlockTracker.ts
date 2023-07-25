import type SafeEventEmitter from '@metamask/safe-event-emitter';

export type BlockTracker = SafeEventEmitter & {
  destroy(): Promise<void>;

  isRunning(): boolean;

  getCurrentBlock(): string | null;

  getLatestBlock(): Promise<string>;
};
