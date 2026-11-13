import { afterEach, beforeEach, vi } from 'vitest';

/* oxlint-disable vitest/require-top-level-describe -- setup file, not a suite */

/**
 * A test fails when it schedules a real timer longer than this. Shorter real
 * timers (for example a zero-delay hop to the next macrotask) are allowed.
 */
const MAX_REAL_TIMER_MS = 10;

/**
 * Real timers the tests cannot fake (third-party internals), matched against
 * the scheduling stack. Every entry names the code that schedules the timer
 * and says why it cannot run on fake time. None are needed today.
 */
const REAL_TIMER_EXCEPTIONS: { name: string; stack: RegExp }[] = [];

const realTimerViolations: string[] = [];

/**
 * Record a real timer that is longer than the limit and not an exception.
 *
 * @param kind - The timer function that was called.
 * @param delay - The requested delay.
 */
function checkRealTimer(kind: string, delay: unknown): void {
  if (!(Number(delay) > MAX_REAL_TIMER_MS)) {
    return;
  }
  const stack = new Error().stack ?? '';
  if (REAL_TIMER_EXCEPTIONS.some((exception) => exception.stack.test(stack))) {
    return;
  }
  const caller = stack.split('\n').slice(3, 7).join('\n');
  realTimerViolations.push(`${kind}(${String(delay)} ms)\n${caller}`);
}

const realSetTimeout = globalThis.setTimeout;
const realSetInterval = globalThis.setInterval;

globalThis.setTimeout = Object.assign(
  (
    handler: Parameters<typeof setTimeout>[0],
    delay?: number,
    ...args: unknown[]
  ) => {
    checkRealTimer('setTimeout', delay);
    return realSetTimeout(handler, delay, ...args);
  },
  realSetTimeout,
);

globalThis.setInterval = Object.assign(
  (
    handler: Parameters<typeof setInterval>[0],
    delay?: number,
    ...args: unknown[]
  ) => {
    checkRealTimer('setInterval', delay);
    return realSetInterval(handler, delay, ...args);
  },
  realSetInterval,
);

// Every test runs on fake time that jumps to the next timer once the event
// loop is idle, so production polls, retries and timeouts cost no wall-clock
// time and keep their order. A test that installs fake timers itself gets a
// fresh manual clock.
beforeEach(() => {
  vi.useFakeTimers();
  vi.setTimerTickMode('nextTimerAsync');
});

afterEach(() => {
  vi.useRealTimers();
  const violations = realTimerViolations.splice(0);
  if (violations.length > 0) {
    throw new Error(
      `Real timers above ${MAX_REAL_TIMER_MS} ms were scheduled. Keep the test on fake timers:\n\n${violations.join('\n\n')}`,
    );
  }
});
