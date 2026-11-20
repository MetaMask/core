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

/**
 * Thrown when an escrow refuses a mutation without applying it, or when Auth no
 * longer approves a mutation no escrow has applied.
 *
 * When every remaining escrow refuses, or Auth does, the controller clears the
 * pending mutation. Start a new mutation; do not call `resume()`.
 */
export class MutationRejectedError extends MfaRecoveryError {
  constructor(message: string) {
    super(message, 'mutation_rejected');
    this.name = 'MutationRejectedError';
  }
}

/**
 * @returns The error for a mutation cleared because another write already
 * updated one of its escrows.
 */
export function mutationSupersededError(): MfaRecoveryError {
  return new MfaRecoveryError(
    'Escrows were updated by another write; reread state',
    'mutation_superseded',
  );
}
