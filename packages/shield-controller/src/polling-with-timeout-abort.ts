export type RequestEntry = {
  abortController: AbortController; // The abort controller for the request
  abortHandler: () => void; // The abort handler for the request
  timerId: NodeJS.Timeout; // The timer ID for the request timeout
};

export type RequestFn<ReturnType> = (
  signal: AbortSignal,
) => Promise<ReturnType>;

export class PollingWithTimeoutAndAbort {
  readonly ABORT_REASON_TIMEOUT = 'Timeout';

  readonly ABORT_REASON_USER_CANCELLATION = 'User cancellation';

  // Map of request ID to request entry
  readonly #requestEntries: Map<string, RequestEntry> = new Map();

  readonly #timeout: number;

  readonly #pollInterval: number;

  constructor(config: { timeout: number; pollInterval: number }) {
    this.#timeout = config.timeout;
    this.#pollInterval = config.pollInterval;
  }

  async pollRequest<ReturnType>(
    requestId: string,
    requestFn: RequestFn<ReturnType>,
    pollingOptions: {
      timeout?: number;
      pollInterval?: number;
      fnName?: string;
    } = {
      fnName: '',
    },
  ) {
    const timeout = pollingOptions.timeout ?? this.#timeout;
    const pollInterval = pollingOptions.pollInterval ?? this.#pollInterval;

    // clean up the request entry if it exists
    this.abortPendingRequests(requestId);

    // insert the request entry for the next polling cycle
    const { abortController } = this.#insertRequestEntry(requestId, timeout);

    while (!abortController.signal.aborted) {
      try {
        const result = await requestFn(abortController.signal);
        // polling success, we just need to clean up the request entry and return the result
        this.#cleanUpOnFinished(requestId);
        return result;
      } catch {
        // polling failed due to timeout or cancelled,
        // we need to clean up the request entry and throw the error
        if (this.#isAbortedAndNotTimeoutReason(abortController.signal)) {
          throw new Error(`${pollingOptions.fnName}: Request cancelled`);
        }
      }
      await this.#delay(pollInterval);
    }

    // The following line will not have an effect as the upper level promise
    // will already be rejected by now.
    throw new Error(`${pollingOptions.fnName}: Request timed out`);
  }

  /**
   * Abort the pending requests.
   * This will clean up the request entry if it exists, and abort the pending request if it exists.
   *
   * @param requestId - The ID of the request to abort.
   */
  abortPendingRequests(requestId: string) {
    // firstly clean up the request entry if it exists
    // note: this does not abort the request, it only cleans up the request entry for the next polling cycle
    const existingEntry = this.#cleanUpRequestEntryIfExists(requestId);
    // then abort the request if it exists
    // note: this does abort the request, but it will not trigger the abort handler (hence, {@link cleanUpRequestEntryIfExists} will not be called)
    // coz the AbortHandler event listener is already removed from the AbortSignal
    existingEntry?.abortController.abort(this.ABORT_REASON_USER_CANCELLATION);
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
    const timerId = setTimeout(
      () => this.#handleRequestTimeout(requestId),
      timeout,
    );

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
   * Handle the request timeout.
   * This will abort the request, this will also trigger the abort handler (hence, {@link #cleanUpRequestEntryIfExists} will be called)
   *
   * @param requestId - The ID of the request to handle the timeout for.
   */
  #handleRequestTimeout(requestId: string) {
    const requestEntry = this.#cleanUpRequestEntryIfExists(requestId);
    if (requestEntry) {
      // Abort the request, this will also trigger the abort handler (hence, handleRequestAbort will be called)
      requestEntry.abortController.abort(this.ABORT_REASON_TIMEOUT);
    }
  }

  /**
   * Clean up the request entry upon finished (success or failure).
   * This will remove the abort handler from the AbortSignal, clear the timeout, and remove the request entry.
   *
   * @param requestId - The ID of the request to clean up for.
   */
  #cleanUpOnFinished(requestId: string) {
    const requestEntry = this.#cleanUpRequestEntryIfExists(requestId);
    if (requestEntry) {
      requestEntry.abortController.signal.removeEventListener(
        'abort',
        requestEntry.abortHandler,
      );
    }
  }

  /**
   * Clean up the request entry if it exists.
   * This will clear the pending timeout, remove the event listener from the AbortSignal, and remove the request entry.
   *
   * @param requestId - The ID of the request to handle the abort for.
   * @returns The request entry that was aborted, if it exists.
   */
  #cleanUpRequestEntryIfExists(requestId: string): RequestEntry | undefined {
    const requestEntry = this.#requestEntries.get(requestId);
    if (requestEntry) {
      clearTimeout(requestEntry.timerId); // Clear the timeout
      this.#requestEntries.delete(requestId); // Remove the request entry
      return requestEntry;
    }
    return undefined;
  }

  /**
   * Check if the abort signal is aborted and not due to timeout.
   *
   * @param signal - The abort signal to check.
   * @returns True if the abort signal is aborted and not due to timeout, false otherwise.
   */
  #isAbortedAndNotTimeoutReason(signal: AbortSignal) {
    return signal.aborted && signal.reason !== this.ABORT_REASON_TIMEOUT;
  }

  async #delay(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
