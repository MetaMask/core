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
