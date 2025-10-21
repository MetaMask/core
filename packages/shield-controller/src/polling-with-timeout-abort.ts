export type RequestEntry = {
  abortController: AbortController; // The abort controller for the request
  abortHandler: (ev: Event) => void; // The abort handler for the request
  timerId: NodeJS.Timeout; // The timer ID for the request timeout
};

export type RequestFn<ReturnType> = (
  signal: AbortSignal,
) => Promise<ReturnType>;

export class PollingWithTimeoutAndAbort {
  readonly ABORT_REASON_TIMEOUT = 'Request timed out';

  readonly ABORT_REASON_CANCELLED = 'Request cancelled';

  // Map of request ID to request entry
  readonly #requestEntries: Map<string, RequestEntry> = new Map();

  readonly #timeout: number;

  readonly #pollInterval: number;

  constructor(config: { timeout: number; pollInterval: number }) {
    this.#timeout = config.timeout;
    this.#pollInterval = config.pollInterval;
  }

  /**
   * Poll a request with a timeout and abort.
   * This will poll the request until it succeeds or fails due to the timeout or the abort signal being triggered.
   *
   * @param requestId - The ID of the request to poll.
   * @param requestFn - The function to poll the request.
   * @param pollingOptions - The options for the polling.
   * @param pollingOptions.timeout - The timeout for the request. Defaults to the constructor's timeout.
   * @param pollingOptions.pollInterval - The interval for the polling. Defaults to the constructor's pollInterval.
   * @param pollingOptions.fnName - The name of the function to poll the request. Defaults to an empty string.
   * @returns The result of the request.
   */
  async pollRequest<ReturnType>(
    requestId: string,
    requestFn: RequestFn<ReturnType>,
    pollingOptions: {
      timeout?: number;
      pollInterval?: number;
      fnName?: string;
    } = {},
  ) {
    const timeout = pollingOptions.timeout ?? this.#timeout;
    const pollInterval = pollingOptions.pollInterval ?? this.#pollInterval;

    // clean up the request entry if it exists
    this.abortPendingRequest(requestId);
    await this.#requestEntryCleanedUp(requestId);

    // insert the request entry for the next polling cycle
    const { abortController } = this.#insertRequestEntry(requestId, timeout);

    while (!abortController.signal.aborted) {
      try {
        const result = await requestFn(abortController.signal);
        // polling success, we just need to clean up the request entry and return the result
        this.#cleanUpOnFinished(requestId);
        return result;
      } catch {
        if (abortController.signal.aborted) {
          // request failed due to the abort signal being triggered,
          // then we will break out of the polling loop
          break;
        }
        // otherwise, we will wait for the next polling cycle
        // and continue the polling loop
        await this.#delayWithAbortSignal(pollInterval, abortController.signal);
        continue;
      }
    }
    // At this point, the polling loop has exited and abortController is aborted
    const abortReason = abortController.signal.reason;
    const errorMessage = pollingOptions.fnName
      ? `${pollingOptions.fnName}: ${abortReason}`
      : abortReason;
    throw new Error(errorMessage);
  }

  /**
   * Abort the pending requests.
   * This will clean up the request entry if it exists, and abort the pending request if it exists.
   *
   * @param requestId - The ID of the request to abort.
   */
  abortPendingRequest(requestId: string) {
    const requestEntry = this.#requestEntries.get(requestId);
    requestEntry?.abortController.abort(this.ABORT_REASON_CANCELLED);
  }

  /**
   * Insert a new request entry.
   * This will create a new abort controller, set a timeout to abort the request if it takes too long, and set the abort handler.
   *
   * @param requestId - The ID of the request to insert the entry for.
   * @param timeout - The timeout for the request.
   * @returns The request entry that was inserted.
   */
  #insertRequestEntry(requestId: string, timeout: number) {
    const abortController = new AbortController();

    // Set a timeout to abort the request if it takes too long
    const timerId = setTimeout(() => {
      abortController.abort(this.ABORT_REASON_TIMEOUT);
    }, timeout);

    // Set the abort handler and listen to the `abort` event
    const abortHandler = () => {
      this.#cleanUpOnFinished(requestId);
    };
    abortController.signal.addEventListener('abort', abortHandler);

    const requestEntry: RequestEntry = {
      abortController,
      abortHandler,
      timerId,
    };

    // Insert the request entry
    this.#requestEntries.set(requestId, requestEntry);

    return requestEntry;
  }

  /**
   * Clean up the request entry upon finished (success or failure).
   * This will remove the abort handler from the AbortSignal, clear the timeout, and remove the request entry.
   *
   * @param requestId - The ID of the request to clean up for.
   * @returns The request entry that was cleaned up, if it exists.
   */
  #cleanUpOnFinished(requestId: string): RequestEntry | undefined {
    const requestEntry = this.#requestEntries.get(requestId);
    if (requestEntry) {
      clearTimeout(requestEntry.timerId); // Clear the timeout
      this.#requestEntries.delete(requestId); // Remove the request entry
      requestEntry.abortController.signal.removeEventListener(
        'abort',
        requestEntry.abortHandler,
      );
    }
    return requestEntry;
  }

  /**
   * Delay with an abort signal.
   * This will delay the execution of the code until the abort signal is triggered.
   *
   * @param ms - The number of milliseconds to delay.
   * @param abortSignal - The abort signal to listen to.
   * @returns A promise that resolves when the delay is complete.
   */
  async #delayWithAbortSignal(ms: number, abortSignal: AbortSignal) {
    return new Promise((resolve) => {
      let timer: NodeJS.Timeout | null = null;

      const abortHandlerForDelay = () => {
        // clear the timeout and resolve the promise
        // Note: we don't reject the promise as this is only a dummy delay
        if (timer) {
          clearTimeout(timer);
        }
        resolve(undefined);
      };

      timer = setTimeout(() => {
        abortSignal.removeEventListener('abort', abortHandlerForDelay);
        resolve(undefined);
      }, ms);

      // set the abort handler to clear the timeout and resolve the promise
      abortSignal.addEventListener('abort', abortHandlerForDelay, {
        once: true, // only listen to the abort event once
      });
    });
  }
}
