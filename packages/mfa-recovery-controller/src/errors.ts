/**
 * Errors thrown by `MfaRecoveryController`.
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
 * Checks whether a value is an {@link MfaRecoveryError} with the given code.
 *
 * @param error - Value to check, usually a caught error.
 * @param code - Expected `MfaRecoveryError` code.
 * @returns Whether `error` is an `MfaRecoveryError` with that code.
 */
export function isMfaRecoveryError(
  error: unknown,
  code: string,
): error is MfaRecoveryError {
  return error instanceof MfaRecoveryError && error.code === code;
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
