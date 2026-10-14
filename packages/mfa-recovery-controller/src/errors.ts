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
 * - `pending_unreadable` — the persisted pending record cannot be decrypted or
 *   validated (for example, the encryption key or escrow set changed). The
 *   original error is available as `cause`. {@link MfaRecoveryController.getPhase}
 *   reports `unreadable`; {@link MfaRecoveryController.abort} with
 *   `discardUnreadable: true` clears the record without reading it.
 * - `invalid_transition` — an internal phase change was not allowed by the
 *   transition table. This indicates a bug in the controller.
 */
export class MfaRecoveryError extends Error {
  readonly code: string;

  constructor(message: string, code: string, options?: { cause?: unknown }) {
    super(message, options);
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
 * Thrown when an escrow refuses a mutation.
 *
 * The controller treats a refusal as proof the mutation was not applied only on
 * the first send to that escrow, or when the escrow's status call reports it was
 * not applied. When every escrow proves this and none has a receipt, the
 * controller clears the pending mutation; start a new mutation and do not call
 * `resume()`. Other refusals leave the mutation in `writing`.
 */
export class MutationRejectedError extends MfaRecoveryError {
  constructor(message: string) {
    super(message, 'mutation_rejected');
    this.name = 'MutationRejectedError';
  }
}
