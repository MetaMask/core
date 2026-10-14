/**
 * Errors thrown by `MfaRecoveryController`.
 *
 * The {@link MfaRecoveryError.code} string identifies the failure for
 * programmatic handling. Timeout and cancellation codes introduced for bounded
 * external calls:
 *
 * - `invalid_timeout` — `promptTimeoutMs` or `requestTimeoutMs` is not a
 *   positive integer (thrown from the constructor).
 * - `prompt_timeout` — a user-facing authorization or identifier prompt exceeded
 *   `promptTimeoutMs`; a pending mutation often remains in `authorizing` until
 *   {@link MfaRecoveryController.abort} or {@link MfaRecoveryController.resume}.
 * - `request_timeout` — a bounded network or pending-state request exceeded
 *   `requestTimeoutMs`; recovery depends on whether writing was already
 *   persisted (use {@link MfaRecoveryController.getPhase} and `resume()` when
 *   in `writing`).
 * - `operation_aborted` — cooperative cancellation (`abort()`, aborted signal,
 *   or an operation queued after an allowed abort); allowed abort clears
 *   `authorizing` pending to `idle`.
 * - `abort_not_allowed` — {@link MfaRecoveryController.abort} while escrow apply
 *   may have started; finish with {@link MfaRecoveryController.resume}.
 */
export class MfaRecoveryError extends Error {
  readonly code: string;

  constructor(message: string, code: string) {
    super(message);
    this.name = 'MfaRecoveryError';
    this.code = code;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * Thrown when a mutation is not acknowledged by every configured escrow.
 * Call `MfaRecoveryController.resume()` to retry the same mutation.
 */
export class IncompleteMutationError extends MfaRecoveryError {
  readonly mutationId: string;

  constructor(mutationId: string) {
    super(
      `Mutation ${mutationId} is not acknowledged by every escrow`,
      'incomplete_mutation',
    );
    this.name = 'IncompleteMutationError';
    this.mutationId = mutationId;
  }
}

/**
 * Thrown when an escrow refuses a mutation without applying it.
 *
 * When every escrow does this and none has a receipt, the controller clears
 * the pending mutation. Start a new mutation; do not call `resume()`.
 */
export class MutationRejectedError extends MfaRecoveryError {
  constructor(message: string) {
    super(message, 'mutation_rejected');
    this.name = 'MutationRejectedError';
  }
}
