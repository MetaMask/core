import { afterEach, beforeEach, vi } from 'vitest';

/* oxlint-disable vitest/require-top-level-describe -- setup file, not a suite */

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
});
