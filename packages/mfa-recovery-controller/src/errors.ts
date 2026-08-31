/**
 * Errors thrown by {@link MfaRecoveryController}.
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
 * Thrown when a mutation was applied at some but not all configured escrows.
 * Call {@link MfaRecoveryController.resume} to retry the same mutation.
 */
export class MutationRepairPendingError extends MfaRecoveryError {
  readonly mutationId: string;

  constructor(mutationId: string) {
    super(
      `Mutation ${mutationId} is not acknowledged by every escrow`,
      'mutation_repair_pending',
    );
    this.mutationId = mutationId;
  }
}
