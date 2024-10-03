import type { Json } from '@metamask/utils';

export type PollingTokenSetId = string;

export type IPollingController<PollingInput extends Json> = {
  startPolling(input: PollingInput): string;

  stopAllPolling(): void;

  stopPollingByPollingToken(pollingToken: string): void;

  onPollingComplete(
    input: PollingInput,
    callback: (input: PollingInput) => void,
  ): void;

  _executePoll(input: PollingInput): Promise<void>;
  _startPolling(input: PollingInput): void;
  _stopPollingByPollingTokenSetId(key: PollingTokenSetId): void;
};

/**
 * TypeScript enforces this type for mixin constructors.
 *
 * Removing the `any` type results in the following error:
 * 'A mixin class must have a constructor with a single rest parameter of type 'any[]'.ts(2545)'
 *
 * A potential future refactor that removes the mixin pattern may be able to fix this.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Constructor = new (...args: any[]) => object;
