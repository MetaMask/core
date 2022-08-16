import EventEmitter from 'events';
import EMPTY_FUNCTION from './emptyFunction';

type SetTimeoutCallback = () => any;

interface SetTimeoutCall {
  callback: SetTimeoutCallback;
  duration: number;
  timeout: NodeJS.Timeout;
}

type InterceptingCallback = (
  callback: SetTimeoutCallback,
  stopPassingThroughCalls: () => void,
) => SetTimeoutCallback;

const originalSetTimeout = setTimeout;

/**
 * A class that provides a mock implementation for `setTimeout` which records
 * the callback given so that it can be replayed later.
 */
class SetTimeoutRecorder {
  public calls: SetTimeoutCall[];

  #interceptCallback: InterceptingCallback;

  #events: EventEmitter;

  #numAutomaticCallsRemaining: number;

  constructor({
    numAutomaticCalls = 0,
    interceptCallback = (callback) => callback,
  }: {
    numAutomaticCalls?: number;
    interceptCallback?: InterceptingCallback;
  }) {
    this.#interceptCallback = interceptCallback;

    this.calls = [];
    this.#events = new EventEmitter();
    this.#numAutomaticCallsRemaining = numAutomaticCalls;
  }

  /**
   * Removes the first `setTimeout` call from the call stack and calls it, or
   * waits until one appears.
   *
   * @returns A promise that resolves when the first `setTimeout` call is
   * called.
   */
  next(): Promise<void> {
    return new Promise<void>((resolve) => {
      if (this.calls.length > 0) {
        const call = this.calls.shift() as SetTimeoutCall;
        call.callback();
        resolve();
      } else {
        this.#events.once('setTimeoutAdded', () => {
          const call = this.calls.shift() as SetTimeoutCall;
          call.callback();
          resolve();
        });
      }
    });
  }

  /**
   * Looks for the first `setTimeout` call in the call stack that matches the
   * given duration and calls it, removing it from the call stack, or waits
   * until such a call appears.
   *
   * @param duration - The expected duration of a `setTimeout` call.
   * @returns A promise that resolves when a `setTimeout` call matching the
   * given duration is called.
   */
  nextMatchingDuration(duration: number): Promise<void> {
    return new Promise<void>((resolve) => {
      const index = this.calls.findIndex((call) => call.duration === duration);

      if (index === -1) {
        const listener = (call: SetTimeoutCall, callIndex: number) => {
          if (call.duration === duration) {
            this.calls.splice(callIndex, 1);
            call.callback();
            this.#events.off('setTimeoutAdded', listener);
            resolve();
          }
        };
        this.#events.on('setTimeoutAdded', listener);
      } else {
        const call = this.calls[index];
        this.calls.splice(index, 1);
        call.callback();
        resolve();
      }
    });
  }

  /**
   * Registers a callback that will be called when `setTimeout` is called and
   * the expected number of `setTimeout` calls (as specified via
   * `numAutomaticCalls`) is exceeded.
   *
   * @param callback - The callback to register.
   */
  onNumAutomaticCallsExhausted(callback: () => void): void {
    this.#events.on('numCallsToPassThroughExhausted', callback);
  }

  /**
   * The function with which to replace the global `setTimeout` function. This
   * mock implementation will record the call to `setTimeout`, along with its
   * callback and duration, in a call stack, which can be accessed later.
   *
   * @param callback - The callback associated with a particular `setTimeout`
   * call.
   * @param duration - The duration associated with a particular `setTimeout`
   * call.
   * @returns An instance of NodeJS.Timeout which is only supplied to fulfill
   * the existing type of `setTimeout` and serves no purpose.
   */
  _mockSetTimeoutImplementation = (
    callback: SetTimeoutCallback,
    duration: number | undefined = 0,
  ): NodeJS.Timeout => {
    // We still need `setTimeout` to return some kind of Timeout object, as this
    // is what the signature of `setTimeout` demands, and anyway, we need an
    // object that has an `unref` method on it. We don't need this timeout to
    // do anything, we just need the object, so we need to call the unstubbed
    // version of `setTimeout` in order to obtain that.
    const timeout = originalSetTimeout(EMPTY_FUNCTION, 0);
    const interceptedCallback = this.#interceptCallback(
      callback,
      this.#stopPassingThroughCalls.bind(this),
    );
    const call = {
      callback: interceptedCallback,
      duration,
      timeout,
    };
    this.calls.push(call);

    if (this.#numAutomaticCallsRemaining > 0) {
      call.callback();
      this.#numAutomaticCallsRemaining -= 1;
    } else {
      this.#events.emit('numCallsToPassThroughExhausted');
    }
    this.#events.emit('setTimeoutAdded');
    return timeout;
  };

  /**
   * The function with which to replace the global `clearTimeout` function. This
   * mock implementation will find a call to `setTimeout` that returned the
   * given Timeout object and remove it from the queue. If no such call has been
   * made, then this does nothing.
   *
   * @param timeout - A Timeout object as returned by `setTimeout`.
   */
  _mockClearTimeoutImplementation = (timeout: NodeJS.Timeout): void => {
    const index = this.calls.findIndex((c) => c.timeout === timeout);

    if (index !== -1) {
      this.calls.splice(index, 1);
    }
  };

  #stopPassingThroughCalls() {
    this.#numAutomaticCallsRemaining = 0;
  }
}

/**
 * Replaces the global `setTimeout` function with one which, upon being called,
 * records the callback given to it. The callback may be stored in a queue to be
 * called later using `next` / `nextMatchingDuration`, or it may be called
 * immediately.
 *
 * @param options - The options.
 * @param options.numAutomaticCalls - By default, it is up to you to manually
 * call `setTimeout`s that have been queued. If you know the number of times
 * `setTimeout` should be called within a test, however, you may specify that
 * here, and each time `setTimeout` is called, its callback will be called
 * immediately, up to this many times (default: 0).
 * @param options.interceptCallback - A function that can be used to replace a
 * callback that is passed to `setTimeout`, allowing you to call it yourself
 * (perhaps in a `try`/`catch` block, or something else).
 * @returns An object that can be used to interact with calls to `setTimeout`.
 */
export default function recordCallsToSetTimeout({
  numAutomaticCalls = 0,
  interceptCallback = (callback) => callback,
}: {
  numAutomaticCalls?: number;
  interceptCallback?: InterceptingCallback;
} = {}): SetTimeoutRecorder {
  const setTimeoutRecorder = new SetTimeoutRecorder({
    numAutomaticCalls,
    interceptCallback,
  });

  jest
    .spyOn(global, 'setTimeout')
    .mockImplementation(setTimeoutRecorder._mockSetTimeoutImplementation);

  jest
    .spyOn(global, 'clearTimeout')
    .mockImplementation(setTimeoutRecorder._mockClearTimeoutImplementation);

  return setTimeoutRecorder;
}
