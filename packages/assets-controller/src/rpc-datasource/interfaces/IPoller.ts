import type { PollingInput } from '../types';

/**
 * Poller status.
 */
export type PollerStatus = 'idle' | 'polling' | 'stopped';

/**
 * Poller configuration.
 */
export type PollerConfig = {
  /** Polling interval in milliseconds */
  intervalMs: number;
  /** Whether to poll immediately on start */
  pollOnStart?: boolean;
  /** Maximum consecutive errors before stopping */
  maxConsecutiveErrors?: number;
};

/**
 * Poller interface.
 *
 * Manages the polling lifecycle for RPC operations.
 * Extends StaticIntervalPollingController pattern.
 */
export type IPoller<TInput extends PollingInput = PollingInput> = {
  /**
   * Start polling for a specific input.
   *
   * @param input - Polling input (chainId, accountId).
   * @returns Polling token that can be used to stop this specific poll.
   */
  startPolling(input: TInput): string;

  /**
   * Stop polling for a specific polling token.
   *
   * @param pollingToken - Token returned from startPolling.
   */
  stopPollingByPollingToken(pollingToken: string): void;

  /**
   * Stop all active polling.
   */
  stopAllPolling(): void;

  /**
   * Set the polling interval.
   *
   * @param intervalMs - Interval in milliseconds.
   */
  setIntervalLength(intervalMs: number): void;

  /**
   * Get the current polling interval.
   *
   * @returns Interval in milliseconds.
   */
  getIntervalLength(): number | undefined;

  /**
   * Trigger an immediate poll (outside of regular interval).
   *
   * @param input - Polling input.
   */
  triggerPoll(input: TInput): Promise<void>;

  /**
   * Execute the poll logic (called by polling infrastructure).
   *
   * @param input - Polling input.
   */
  _executePoll(input: TInput): Promise<void>;
};
