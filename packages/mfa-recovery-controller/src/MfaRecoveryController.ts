import type {
  ControllerGetStateAction,
  ControllerStateChangedEvent,
  StateMetadata,
} from '@metamask/base-controller';
import { BaseController } from '@metamask/base-controller';
import type { Messenger } from '@metamask/messenger';
import { bytesToHex, hexToBytes, isHexAddress } from '@metamask/utils';

import { decodeAuthControllerToken } from './auth-controller-token.js';
import {
  decryptFromPublic,
  encryptToPublic,
  generateWrapKey,
  hash,
  randomId,
  unixNow,
  wrapKeyId,
} from './crypto.js';
import {
  IncompleteMutationError,
  MfaRecoveryError,
  MutationRejectedError,
  mutationSupersededError,
} from './errors.js';
import {
  authorizeEscrowsWithToken,
  countDistinctIdentifiers,
  findNewSiweIdentifiers,
  getIdentifierAuthMode,
  getSiweNamespace,
  MAX_IDENTIFIERS,
  MIN_IDENTIFIERS,
  requestKeyBoundIdentifierToken,
} from './identifier-auth.js';
import type { MfaRecoveryControllerMethodActions } from './MfaRecoveryController-method-action-types.js';
import {
  assertValidPendingOperation,
  pendingPayloadHasIdentifiers,
  pendingPayloadHasRecoverySecret,
} from './pending-operation-validation.js';
import {
  getAppliedMutationReceipts,
  verifyMutationReceipt,
} from './receipt-utils.js';
import {
  assertSameVersion,
  assertEnrolledInEvery,
  getRejectionFromEveryEscrow,
  isFulfilledResult,
  planRepair,
  getEscrowIdentifiers,
  selectHighestConsistentVersion,
} from './replica-utils.js';
import { getRecoveryPhase } from './state-machine.js';
import type {
  AuthControllerToken,
  GetIdentifiersResponse,
  Identifier,
  IdentifierAuthorization,
  IdentifierSession,
  KeyBoundCredential,
  Mutation,
  MutationPayload,
  MutationReceipt,
  PendingOperation,
  PendingOperationEncryptor,
  PendingRegisterPayload,
  PendingUpdateIdentifiersPayload,
  PendingUpdateRecoverySecretPayload,
  RecoveryApproval,
  RecoveryAuthProvider,
  RecoveryEscrowProvider,
  RecoveryIdentifierAuthProvider,
  RecoveryIdentifiers,
  RecoveryLockProvider,
  RecoveryPhase,
  RecoveredSecret,
  WrappedSecret,
  WritingPendingOperation,
} from './types.js';

const CONTROLLER_NAME = 'MfaRecoveryController';

// How far the device clock may run ahead of an escrow's.
const CLOCK_SKEW_SECONDS = 5 * 60;

const MESSENGER_EXPOSED_METHODS = [
  'acquireLock',
  'releaseLock',
  'register',
  'updateRecoverySecret',
  'updateIdentifiers',
  'authenticateIdentifier',
  'getRecoverySecret',
  'getIdentifiers',
  'resume',
  'abort',
  'getPhase',
] as const;

export type MfaRecoveryControllerState = {
  /**
   * Held recovery lease ID, reused when retrying, or `null`.
   */
  lockId: string | null;
  /**
   * Encrypted pending mutation, or `null` when idle.
   */
  pendingOperation: string | null;
};

const mfaRecoveryControllerMetadata = {
  lockId: {
    persist: true,
    includeInDebugSnapshot: false,
    includeInStateLogs: false,
    usedInUi: false,
  },
  pendingOperation: {
    persist: true,
    includeInDebugSnapshot: false,
    includeInStateLogs: false,
    usedInUi: true,
  },
} satisfies StateMetadata<MfaRecoveryControllerState>;

/**
 * @returns The default {@link MfaRecoveryController} state.
 */
export function getDefaultMfaRecoveryControllerState(): MfaRecoveryControllerState {
  return { lockId: null, pendingOperation: null };
}

export type MfaRecoveryControllerGetStateAction = ControllerGetStateAction<
  typeof CONTROLLER_NAME,
  MfaRecoveryControllerState
>;

export type MfaRecoveryControllerActions =
  | MfaRecoveryControllerGetStateAction
  | MfaRecoveryControllerMethodActions;

type AllowedActions = never;

export type MfaRecoveryControllerStateChangedEvent =
  ControllerStateChangedEvent<
    typeof CONTROLLER_NAME,
    MfaRecoveryControllerState
  >;

export type MfaRecoveryControllerEvents =
  MfaRecoveryControllerStateChangedEvent;

type AllowedEvents = never;

export type MfaRecoveryControllerMessenger = Messenger<
  typeof CONTROLLER_NAME,
  MfaRecoveryControllerActions | AllowedActions,
  MfaRecoveryControllerEvents | AllowedEvents
>;

export type MfaRecoveryControllerOptions = {
  /**
   * The messenger suited for this controller.
   */
  messenger: MfaRecoveryControllerMessenger;

  /**
   * The desired state with which to initialize this controller. Missing
   * properties will be filled in with defaults.
   */
  state?: Partial<MfaRecoveryControllerState>;

  /**
   * Authenticates the MetaMask profile and issues request-bound attestations.
   */
  authProvider: RecoveryAuthProvider;

  /**
   * Holds the per-profile recovery lease.
   */
  lockProvider: RecoveryLockProvider;

  /**
   * Obtains key-bound identifier tokens from an IdP.
   */
  identifierAuthProvider: RecoveryIdentifierAuthProvider;

  /**
   * Ordered, non-empty set of recovery escrow replicas. This is build-time
   * configuration; public methods cannot override it.
   */
  escrows: RecoveryEscrowProvider[];

  /**
   * Encrypts pending mutation state using wallet secure storage.
   */
  pendingOperationEncryptor: PendingOperationEncryptor;

  /**
   * Clock used for AuthController token expiry checks. Unix seconds.
   * Defaults to {@link unixNow}.
   */
  now?: () => number;
};

type MutateParams = {
  epoch: number;
} & (
  | {
      operation: 'register';
      payload: PendingRegisterPayload;
      identifier: null;
    }
  | {
      operation: 'updateRecoverySecret';
      payload: PendingUpdateRecoverySecretPayload;
      identifier: Identifier;
    }
  | {
      operation: 'updateIdentifiers';
      payload: PendingUpdateIdentifiersPayload;
      identifier: Identifier;
    }
);

/**
 * Coordinates MFA recovery secret replication across independent escrows.
 */
export class MfaRecoveryController extends BaseController<
  typeof CONTROLLER_NAME,
  MfaRecoveryControllerState,
  MfaRecoveryControllerMessenger
> {
  readonly #authProvider: RecoveryAuthProvider;

  readonly #lockProvider: RecoveryLockProvider;

  readonly #identifierAuthProvider: RecoveryIdentifierAuthProvider;

  readonly #escrows: RecoveryEscrowProvider[];

  readonly #encryptor: PendingOperationEncryptor;

  readonly #now: () => number;

  #lock: Promise<void> = Promise.resolve();

  constructor({
    messenger,
    state,
    authProvider,
    lockProvider,
    identifierAuthProvider,
    escrows,
    pendingOperationEncryptor,
    now = unixNow,
  }: MfaRecoveryControllerOptions) {
    if (escrows.length === 0) {
      throw new MfaRecoveryError(
        'At least one escrow is required',
        'empty_escrow_set',
      );
    }
    const escrowIds = escrows.map((escrow) => escrow.id);
    if (new Set(escrowIds).size !== escrowIds.length) {
      throw new MfaRecoveryError('Duplicate escrow id', 'duplicate_escrow_id');
    }

    super({
      messenger,
      metadata: mfaRecoveryControllerMetadata,
      name: CONTROLLER_NAME,
      state: {
        ...getDefaultMfaRecoveryControllerState(),
        ...state,
      },
    });

    this.#authProvider = authProvider;
    this.#lockProvider = lockProvider;
    this.#identifierAuthProvider = identifierAuthProvider;
    this.#escrows = [...escrows];
    this.#encryptor = pendingOperationEncryptor;
    this.#now = now;

    this.messenger.registerMethodActionHandlers(
      this,
      MESSENGER_EXPOSED_METHODS,
    );
  }

  /**
   * Acquires or extends the per-profile recovery lease. Hold it from the first
   * read through any Auth identifier changes and mutations.
   */
  async acquireLock(): Promise<void> {
    await this.#withLock(async () => this.#acquireLease());
  }

  /**
   * Releases the lease. A pending mutation must finish first.
   */
  async releaseLock(): Promise<void> {
    await this.#withLock(async () => {
      if (await this.#loadPending()) {
        throw new MfaRecoveryError(
          'A pending mutation must be resumed or aborted first',
          'pending_mutation',
        );
      }
      const { lockId } = this.state;
      if (lockId === null) {
        return;
      }
      try {
        await this.#lockProvider.release(lockId);
      } catch (error) {
        // A conflict means another ID holds the lease, so it is not ours.
        if (
          !(error instanceof MfaRecoveryError) ||
          error.code !== 'recovery_lock_conflict'
        ) {
          throw error;
        }
      }
      this.update((state) => {
        state.lockId = null;
      });
    });
  }

  /**
   * Creates version 1 of a recovery record.
   *
   * @param recoverySecret - Secret replicated in full to every escrow.
   * @param identifiers - Ownership-approved identifier set. Must contain at
   * least two identifiers.
   */
  async register(
    recoverySecret: Uint8Array,
    identifiers: Identifier[],
  ): Promise<void> {
    this.#assertValidIdentifiers(identifiers);
    this.#assertIdentifierSet(identifiers);
    await this.#mutate({
      operation: 'register',
      payload: {
        identifiers,
        recoverySecret: bytesToHex(recoverySecret),
      },
      identifier: null,
      epoch: 0,
    });
  }

  /**
   * Replaces the recovery secret.
   *
   * @param identifier - Currently registered identifier used to authorize.
   * @param recoverySecret - New secret.
   * @param epoch - Current recovery version, used as `expectedVersion`.
   */
  async updateRecoverySecret(
    identifier: Identifier,
    recoverySecret: Uint8Array,
    epoch: number,
  ): Promise<void> {
    this.#assertValidIdentifiers([identifier]);
    await this.#mutate({
      operation: 'updateRecoverySecret',
      payload: {
        recoverySecret: bytesToHex(recoverySecret),
      },
      identifier,
      epoch,
    });
  }

  /**
   * Replaces the complete identifier set.
   *
   * @param identifier - Currently registered identifier used to authorize.
   * @param identifiers - New identifier set. Must contain at least two
   * identifiers.
   * @param epoch - Current recovery version, used as `expectedVersion`.
   */
  async updateIdentifiers(
    identifier: Identifier,
    identifiers: Identifier[],
    epoch: number,
  ): Promise<void> {
    this.#assertValidIdentifiers([identifier, ...identifiers]);
    this.#assertIdentifierSet(identifiers);
    await this.#mutate({
      operation: 'updateIdentifiers',
      payload: { identifiers },
      identifier,
      epoch,
    });
  }

  /**
   * Authenticates an identifier for a subsequent recovery-secret read.
   *
   * @param identifier - Identifier to authenticate.
   * @returns Ephemeral session data required by {@link getRecoverySecret}.
   */
  async authenticateIdentifier(
    identifier: Identifier,
  ): Promise<IdentifierSession> {
    this.#assertValidIdentifiers([identifier]);
    const requestId = randomId();
    const ephemeral = await generateWrapKey();
    const pkE = ephemeral.publicKey;
    const requestHash = await hash({
      operation: 'getRecoverySecret',
      requestId,
      pkE,
    });
    const credential = await requestKeyBoundIdentifierToken({
      identifier,
      requestHash,
      identifierAuthProvider: this.#identifierAuthProvider,
    });
    return {
      ...credential,
      requestId,
      ephemeralPrivateKey: ephemeral.privateKey,
      pkE,
    };
  }

  /**
   * Reads the recovery secret from available escrows and returns the highest
   * consistent version. `epoch` is the current recovery version and is required
   * by later mutations. Does not wait for a pending mutation to be repaired.
   *
   * @param session - Identifier authentication session used to authorize the
   * read.
   * @returns Recovered secret bytes and the selected epoch.
   */
  async getRecoverySecret(
    session: IdentifierSession,
  ): Promise<RecoveredSecret> {
    return await this.#withLock(async () => {
      const { token, requestId, pkE } = session;
      this.#assertValidIdentifiers([token.identifier]);
      const requestHash = await hash({
        operation: 'getRecoverySecret',
        requestId,
        pkE,
      });
      if (token.requestHash !== requestHash) {
        throw new MfaRecoveryError(
          'Invalid identifier session',
          'invalid_identifier_session',
        );
      }
      const available = await this.#getAvailableEscrows();
      if (available.length === 0) {
        throw new MfaRecoveryError(
          'No escrow is available',
          'no_available_escrow',
        );
      }
      const { approval } = await this.#authProvider.authorizeRecoveryRequest({
        requestHash,
        audiences: available.map((escrow) => escrow.authAudience),
        requireTwoFactor: true,
      });
      const authorizedEscrows = await authorizeEscrowsWithToken({
        escrows: available,
        credentials: [session],
        authControllerToken: approval,
      });
      const results = await Promise.allSettled(
        authorizedEscrows.map(async ({ escrow, authorizations }) => {
          const [authorization] = authorizations;
          const response = await escrow.getSecret(
            approval,
            authorization,
            requestId,
            pkE,
          );
          if (response.wrapKeyId !== (await wrapKeyId(escrow.wrapPublicKey))) {
            throw new MfaRecoveryError(
              'Unexpected wrap key',
              'wrap_key_mismatch',
            );
          }
          return {
            escrowId: escrow.id,
            recoverySecret: await decryptFromPublic(
              session.ephemeralPrivateKey,
              escrow.wrapPublicKey,
              response.recoverySecret.ciphertext,
            ),
            version: response.version,
          };
        }),
      );
      const selected = selectHighestConsistentVersion(results);
      return {
        recoverySecret: selected.recoverySecret,
        epoch: selected.version,
      };
    });
  }

  /**
   * Reads the enrolled identifiers from every escrow, with Auth's current
   * identifiers. Needs no recent MFA, so a new device can build an
   * {@link updateIdentifiers} call from it. Throws `replica_lagging` when
   * escrows are at different versions.
   *
   * @returns Enrolled identifiers, `epoch`, and Auth's identifiers.
   */
  async getIdentifiers(): Promise<RecoveryIdentifiers> {
    return await this.#withLock(async () => {
      await this.#assertEscrowsAvailable(this.#escrows);
      const { escrowIdentifiers, authIdentifiers } = await this.#readReplicas(
        this.#escrows,
      );
      assertSameVersion(escrowIdentifiers);
      const hashes = await Promise.all(
        escrowIdentifiers.map(
          async ({ identifiers }) => await hash(identifiers),
        ),
      );
      if (new Set(hashes).size !== 1) {
        throw new MfaRecoveryError('Replica corruption', 'replica_corruption');
      }
      const [{ identifiers, version: epoch }] = escrowIdentifiers;
      return { identifiers, epoch, authIdentifiers };
    });
  }

  /**
   * Completes a persisted pending mutation. With none pending and an
   * `identifier`, copies the highest escrow record to escrows one version
   * behind it; pass an identifier when a mutation fails with
   * `replica_lagging`. Clears a `writing` mutation, throwing
   * `MutationRejectedError`, once its approval expired more than 5 minutes ago
   * and no escrow applied it.
   *
   * @param identifier - Enrolled identifier that authorizes the repair, or
   * replaces the one authorizing a pending update (e.g. if it was lost).
   */
  async resume(identifier?: Identifier): Promise<void> {
    const hadPending = await this.#withLock(async () => {
      const pending = await this.#loadPending();
      if (pending) {
        await this.#finishPendingMutation(
          identifier && pending.identifier
            ? { ...pending, identifier }
            : pending,
        );
      }
      return pending !== null;
    });
    if (!hadPending && identifier) {
      await this.#repairReplicas(identifier);
    }
  }

  /**
   * Drops `authorizing` pending. Drops `writing` pending only once its approval
   * expired more than 5 minutes ago and no escrow applied it; otherwise finish
   * it with {@link resume}.
   */
  async abort(): Promise<void> {
    await this.#withLock(async () => {
      const pending = await this.#loadPending();
      if (pending?.phase === 'writing' && !(await this.#isUnapplied(pending))) {
        throw new MfaRecoveryError(
          'Cannot abort a mutation that may have been applied',
          'abort_not_allowed',
        );
      }
      if (pending) {
        await this.#clearPending();
      }
    });
  }

  /**
   * @returns Current recovery phase.
   */
  async getPhase(): Promise<RecoveryPhase> {
    return await this.#withLock(async () =>
      getRecoveryPhase(await this.#loadPending()),
    );
  }

  // No write can land after its approval expires, and escrow versions only
  // grow, so every target escrow below `newVersion` means none applied it.
  async #isUnapplied({
    mutation,
    authControllerToken,
  }: WritingPendingOperation): Promise<boolean> {
    if (!this.#isExpiredForEscrows(authControllerToken)) {
      return false;
    }
    const escrows = this.#getTargetEscrows(mutation);
    const { approval } = await this.#authorizeRead(escrows);
    const results = await Promise.allSettled(
      escrows.map(async (escrow) => await escrow.getIdentifiers(approval)),
    );
    return results.every(
      (result) =>
        isFulfilledResult(result) && result.value.version < mutation.newVersion,
    );
  }

  #isExpiredForEscrows(token: AuthControllerToken): boolean {
    const claims = decodeAuthControllerToken(token);
    return (
      claims === undefined || claims.exp + CLOCK_SKEW_SECONDS <= this.#now()
    );
  }

  async #mutate(params: MutateParams, escrows = this.#escrows): Promise<void> {
    const { operation, payload, identifier, epoch } = params;
    await this.#withLock(async () => {
      if (await this.#loadPending()) {
        throw new MfaRecoveryError(
          'A pending mutation must be resumed or aborted first',
          'pending_mutation',
        );
      }

      await this.#assertEscrowsAvailable(escrows);
      const { escrowIdentifiers } = await this.#readReplicas(escrows);
      assertSameVersion(escrowIdentifiers);
      assertEnrolledInEvery(escrowIdentifiers, identifier);

      const profileId = await this.#authProvider.getAuthenticatedProfileId();
      const audiences = escrows.map((escrow) => escrow.id);
      const currentVersion = this.#resolveCurrentRecoveryVersion(epoch);
      const payloadHash = await hash(payload);

      const mutationFields = {
        id: randomId(),
        profileId,
        operation,
        expectedVersion: currentVersion,
        newVersion: currentVersion + 1,
        payloadHash,
        audiences,
      };
      const mutation: Mutation = {
        ...mutationFields,
        requestHash: await hash(mutationFields),
      };

      const pending: PendingOperation = {
        phase: 'authorizing',
        mutation,
        payload,
        identifier,
      };
      await this.#persistPending(pending);

      await this.#replicateMutation(await this.#authorizeWrite(pending));
    });
  }

  // Checks the approval covers the mutation before any proof or write.
  async #authorizeWrite(
    pending: PendingOperation,
  ): Promise<WritingPendingOperation> {
    const { mutation } = pending;
    // The lease outlives the approval, so no write lands after another
    // operation can take the lease.
    await this.#acquireLease();
    const { approval, identifiers } =
      await this.#authProvider.authorizeRecoveryRequest({
        requestHash: mutation.requestHash,
        audiences: this.#getTargetEscrows(mutation).map(
          (escrow) => escrow.authAudience,
        ),
        requireTwoFactor: true,
      });
    const isRenewal = pending.phase === 'writing';
    const writing: WritingPendingOperation = {
      ...pending,
      phase: 'writing',
      authControllerToken: approval,
      approvedIdentifiers: identifiers,
      receipts: isRenewal ? pending.receipts : [],
    };
    await this.#assertPending(writing);
    return writing;
  }

  async #finishPendingMutation(pending: PendingOperation): Promise<void> {
    if (pending.phase === 'authorizing') {
      await this.#assertEscrowsAvailable(
        this.#getTargetEscrows(pending.mutation),
      );
      await this.#replicateMutation(await this.#authorizeWrite(pending));
      return;
    }

    // writing phase
    await this.#replicateMutation(pending);
  }

  async #replicateMutation(pending: WritingPendingOperation): Promise<void> {
    const prepared = await this.#prepareWrite(pending);
    if (!prepared) {
      return;
    }
    const { writing, remainingEscrows, escrowIdentifiers } = prepared;
    const { mutation } = writing;
    const authorizations = await this.#authorizeEscrows(
      writing,
      remainingEscrows,
      escrowIdentifiers,
    );
    const payloads = await Promise.all(
      remainingEscrows.map(async (escrow) =>
        this.#payloadForEscrow(writing, escrow),
      ),
    );

    await this.#persistPending(writing);
    const results = await Promise.allSettled(
      remainingEscrows.map((escrow, index) =>
        escrow.applyMutation(
          mutation,
          writing.authControllerToken,
          authorizations[index],
          payloads[index],
          writing.approvedIdentifiers,
        ),
      ),
    );

    const { receipts, hasInvalidReceipt } = await this.#collectMutationReceipts(
      results,
      remainingEscrows,
      mutation,
      writing.receipts,
    );
    const rejection = getRejectionFromEveryEscrow(results);
    if (rejection) {
      await this.#clearPending();
      throw rejection;
    }
    await this.#persistPending({ ...writing, receipts });

    if (hasInvalidReceipt) {
      throw new MfaRecoveryError('Invalid mutation receipt', 'invalid_receipt');
    }

    if (
      new Set(receipts.map((receipt) => receipt.escrowId)).size !==
      mutation.audiences.length
    ) {
      throw new IncompleteMutationError(mutation.id);
    }
    await this.#clearPending();
  }

  // Finds the escrows left to write. Renews an expired approval only if any
  // are left.
  async #prepareWrite(pending: WritingPendingOperation): Promise<{
    writing: WritingPendingOperation;
    remainingEscrows: RecoveryEscrowProvider[];
    escrowIdentifiers: GetIdentifiersResponse[];
  } | null> {
    const { mutation } = pending;
    const remainingEscrows = await this.#getRemainingEscrows(pending);
    if (remainingEscrows.length === 0) {
      await this.#clearPending();
      return null;
    }

    await this.#assertEscrowsAvailable(remainingEscrows);

    const claims = decodeAuthControllerToken(pending.authControllerToken);
    const isApprovalExpired = claims === undefined || claims.exp <= this.#now();
    let approval = pending.authControllerToken;
    if (isApprovalExpired) {
      // Reads with a read-only approval, which needs no 2FA.
      ({ approval } = await this.#authorizeRead(remainingEscrows));
      if (decodeAuthControllerToken(approval)?.sub !== mutation.profileId) {
        throw new MfaRecoveryError(
          'Pending mutation is for another profile',
          'invalid_pending_operation',
        );
      }
    }
    const escrowIdentifiers = await getEscrowIdentifiers(
      remainingEscrows,
      approval,
    );
    const writtenEscrows = remainingEscrows.filter(
      (_, index) =>
        escrowIdentifiers[index].version !== mutation.expectedVersion,
    );
    if (writtenEscrows.length > 0) {
      return await this.#prepareWrite(
        await this.#withAppliedMutationReceipts(
          pending,
          writtenEscrows,
          approval,
        ),
      );
    }

    // No escrow applied it and none can now. Renewing would only prompt for
    // MFA again.
    if (
      pending.receipts.length === 0 &&
      this.#isExpiredForEscrows(pending.authControllerToken)
    ) {
      await this.#clearPending();
      throw new MutationRejectedError(
        'No escrow applied the mutation before its approval expired',
      );
    }

    // `resume` can replace the identifier, so check its enrollment again.
    assertEnrolledInEvery(escrowIdentifiers, pending.identifier);
    const writing = isApprovalExpired
      ? await this.#authorizeWrite(pending)
      : pending;
    return { writing, remainingEscrows, escrowIdentifiers };
  }

  // Fetches the receipts this client never got for escrows it already wrote,
  // so they are not written again. Clears the mutation if another client
  // wrote any of them instead.
  async #withAppliedMutationReceipts(
    pending: WritingPendingOperation,
    writtenEscrows: RecoveryEscrowProvider[],
    approval: AuthControllerToken,
  ): Promise<WritingPendingOperation> {
    const receipts = await getAppliedMutationReceipts(
      writtenEscrows,
      approval,
      pending.mutation,
    );
    if (!receipts) {
      await this.#clearPending();
      throw mutationSupersededError();
    }
    return { ...pending, receipts: [...pending.receipts, ...receipts] };
  }

  // Runs outside the controller lock: `#mutate` and `getRecoverySecret` take it.
  async #repairReplicas(identifier: Identifier): Promise<void> {
    this.#assertValidIdentifiers([identifier]);
    await this.#assertEscrowsAvailable(this.#escrows);
    const { escrowIdentifiers } = await this.#readReplicas(this.#escrows);
    const plan = await planRepair(this.#escrows, escrowIdentifiers);
    if (!plan) {
      return;
    }
    // Lagging escrows are at `epoch - 1`: replay the write they missed.
    const { operation, epoch, identifiers, laggingEscrows } = plan;
    if (operation === 'updateIdentifiers') {
      await this.#mutate(
        {
          operation,
          payload: { identifiers },
          identifier,
          epoch: epoch - 1,
        },
        laggingEscrows,
      );
      return;
    }

    const secret = await this.getRecoverySecret(
      await this.authenticateIdentifier(identifier),
    );
    if (secret.epoch !== epoch) {
      throw new MfaRecoveryError(
        'Could not read the highest escrow record',
        'read_failed',
      );
    }
    const recoverySecret = bytesToHex(secret.recoverySecret);
    await this.#mutate(
      operation === 'register'
        ? {
            operation,
            payload: { identifiers, recoverySecret },
            identifier: null,
            epoch: 0,
          }
        : {
            operation,
            payload: { recoverySecret },
            identifier,
            epoch: epoch - 1,
          },
      laggingEscrows,
    );
  }

  async #authorizeRead(
    escrows: RecoveryEscrowProvider[],
  ): Promise<RecoveryApproval> {
    return await this.#authProvider.authorizeRecoveryRequest({
      requestHash: await hash({ operation: 'getIdentifiers' }),
      audiences: escrows.map((escrow) => escrow.authAudience),
    });
  }

  // Reads the escrows with a read-only approval, which also returns Auth's
  // identifiers.
  async #readReplicas(escrows: RecoveryEscrowProvider[]): Promise<{
    escrowIdentifiers: GetIdentifiersResponse[];
    authIdentifiers: Identifier[];
  }> {
    const { approval, identifiers } = await this.#authorizeRead(escrows);
    return {
      escrowIdentifiers: await getEscrowIdentifiers(escrows, approval),
      authIdentifiers: identifiers,
    };
  }

  #getTargetEscrows(mutation: Mutation): RecoveryEscrowProvider[] {
    return this.#escrows.filter(({ id }) => mutation.audiences.includes(id));
  }

  async #assertEscrowsAvailable(
    escrows: RecoveryEscrowProvider[],
  ): Promise<void> {
    const availableEscrows = await this.#getAvailableEscrows(escrows);
    // Do we want to wait for all escrows to be available?
    if (availableEscrows.length !== escrows.length) {
      throw new MfaRecoveryError(
        'All configured escrows are required for mutation',
        'escrow_unavailable',
      );
    }
  }

  async #getRemainingEscrows(
    pending: WritingPendingOperation,
  ): Promise<RecoveryEscrowProvider[]> {
    const { mutation } = pending;
    const remainingEscrows: RecoveryEscrowProvider[] = [];
    for (const escrow of this.#getTargetEscrows(mutation)) {
      const receipt = pending.receipts.find(
        (item) => item.escrowId === escrow.id,
      );
      if (receipt === undefined) {
        remainingEscrows.push(escrow);
        continue;
      }
      if (!(await verifyMutationReceipt(receipt, mutation, escrow))) {
        throw new MfaRecoveryError(
          'Invalid mutation receipt',
          'invalid_receipt',
        );
      }
    }
    if (
      remainingEscrows.length + pending.receipts.length !==
      mutation.audiences.length
    ) {
      throw new MfaRecoveryError(
        'Receipt escrow is not configured',
        'unknown_receipt_escrow',
      );
    }
    return remainingEscrows;
  }

  async #collectMutationReceipts(
    results: PromiseSettledResult<MutationReceipt>[],
    escrows: RecoveryEscrowProvider[],
    mutation: Mutation,
    existingReceipts: MutationReceipt[],
  ): Promise<{ receipts: MutationReceipt[]; hasInvalidReceipt: boolean }> {
    const receipts = [...existingReceipts];
    let hasInvalidReceipt = false;
    for (const [index, result] of results.entries()) {
      if (!isFulfilledResult(result)) {
        continue;
      }
      const escrow = escrows[index];
      if (!(await verifyMutationReceipt(result.value, mutation, escrow))) {
        hasInvalidReceipt = true;
        continue;
      }
      receipts.push(result.value);
    }
    return { receipts, hasInvalidReceipt };
  }

  /**
   * Proves the update's enrolled identifier and each SIWE identifier the
   * escrows have not enrolled, all against one challenge per escrow.
   *
   * @param writing - Writing pending mutation.
   * @param escrows - Escrows to authorize.
   * @param escrowIdentifiers - Their identifiers and versions, in `escrows`
   * order.
   * @returns Each escrow's identifier authorizations, in `escrows` order.
   */
  async #authorizeEscrows(
    writing: WritingPendingOperation,
    escrows: RecoveryEscrowProvider[],
    escrowIdentifiers: GetIdentifiersResponse[],
  ): Promise<IdentifierAuthorization[][]> {
    const identifiers = [
      ...(writing.identifier ? [writing.identifier] : []),
      ...findNewSiweIdentifiers(writing, escrowIdentifiers),
    ];
    if (identifiers.length === 0) {
      return escrows.map(() => []);
    }
    const credentials: KeyBoundCredential[] = [];
    for (const identifier of identifiers) {
      getIdentifierAuthMode(identifier.type);
      credentials.push(
        await requestKeyBoundIdentifierToken({
          identifier,
          requestHash: writing.mutation.requestHash,
          identifierAuthProvider: this.#identifierAuthProvider,
        }),
      );
    }
    const authorized = await authorizeEscrowsWithToken({
      escrows,
      credentials,
      authControllerToken: writing.authControllerToken,
    });
    if (authorized.length !== escrows.length) {
      throw new MfaRecoveryError(
        'Unable to authorize every escrow',
        'identifier_auth_failed',
      );
    }
    return authorized.map(({ authorizations }) => authorizations);
  }

  async #payloadForEscrow(
    pending: WritingPendingOperation,
    escrow: RecoveryEscrowProvider,
  ): Promise<MutationPayload> {
    const { payload } = pending;
    if (!pendingPayloadHasRecoverySecret(payload)) {
      return {
        identifiers: payload.identifiers,
      };
    }
    const recoverySecret = await this.#wrapRecoverySecret(
      hexToBytes(payload.recoverySecret),
      escrow.wrapPublicKey,
    );
    if (pendingPayloadHasIdentifiers(payload)) {
      return {
        identifiers: payload.identifiers,
        recoverySecret,
      };
    }
    return { recoverySecret };
  }

  #resolveCurrentRecoveryVersion(epoch: number): number {
    if (!Number.isInteger(epoch) || epoch < 0) {
      throw new MfaRecoveryError('Invalid epoch', 'invalid_epoch');
    }
    return epoch;
  }

  async #getAvailableEscrows(
    escrows: RecoveryEscrowProvider[] = this.#escrows,
  ): Promise<RecoveryEscrowProvider[]> {
    const flags = await Promise.allSettled(
      escrows.map(async (escrow) => ({
        escrow,
        available: await escrow.isAvailable(),
      })),
    );
    return flags.flatMap((result) =>
      isFulfilledResult(result) && result.value.available
        ? [result.value.escrow]
        : [],
    );
  }

  #assertValidIdentifiers(identifiers: Identifier[]): void {
    for (const identifier of identifiers) {
      getIdentifierAuthMode(identifier.type);
      if (
        identifier.type === 'siwe' &&
        (!isHexAddress(identifier.value.toLowerCase()) ||
          identifier.namespace !== getSiweNamespace(identifier))
      ) {
        throw new MfaRecoveryError(
          'SIWE value must be an address and namespace the verifier domain:chainId',
          'invalid_identifier',
        );
      }
    }
  }

  #assertIdentifierSet(identifiers: Identifier[]): void {
    const distinct = countDistinctIdentifiers(identifiers);
    if (distinct < MIN_IDENTIFIERS) {
      throw new MfaRecoveryError(
        `Requires at least ${MIN_IDENTIFIERS} identifiers`,
        'too_few_identifiers',
      );
    }
    if (distinct !== identifiers.length) {
      throw new MfaRecoveryError(
        'Duplicate identifier',
        'duplicate_identifier',
      );
    }
    if (identifiers.length > MAX_IDENTIFIERS) {
      throw new MfaRecoveryError(
        `Supports at most ${MAX_IDENTIFIERS} identifiers`,
        'too_many_identifiers',
      );
    }
  }

  async #wrapRecoverySecret(
    plaintext: Uint8Array,
    wrapPublicKey: Uint8Array,
  ): Promise<WrappedSecret> {
    const ephemeral = await generateWrapKey();
    return {
      pkE: ephemeral.publicKey,
      ciphertext: await encryptToPublic(
        ephemeral.privateKey,
        wrapPublicKey,
        plaintext,
      ),
    };
  }

  async #loadPending(): Promise<PendingOperation | null> {
    const { pendingOperation } = this.state;
    if (pendingOperation === null) {
      return null;
    }
    const pending = (await this.#encryptor.decrypt(
      pendingOperation,
    )) as unknown;
    await this.#assertPending(pending);
    return pending as PendingOperation;
  }

  async #persistPending(operation: PendingOperation): Promise<void> {
    await this.#assertPending(operation);
    const encrypted = await this.#encryptor.encrypt(operation);
    this.update((state) => {
      state.pendingOperation = encrypted;
    });
  }

  async #assertPending(pending: unknown): Promise<void> {
    await assertValidPendingOperation(
      pending,
      this.#escrows.map((escrow) => escrow.id),
    );
  }

  async #clearPending(): Promise<void> {
    this.update((state) => {
      state.pendingOperation = null;
    });
  }

  async #acquireLease(): Promise<void> {
    const lockId = this.state.lockId ?? randomId();
    this.update((state) => {
      state.lockId = lockId;
    });
    try {
      await this.#lockProvider.acquire(lockId);
    } catch (error) {
      // A conflict means another ID holds the lease. Other failures may have
      // acquired it, so keep the ID for a retry.
      if (
        error instanceof MfaRecoveryError &&
        error.code === 'recovery_lock_conflict'
      ) {
        this.update((state) => {
          state.lockId = null;
        });
      }
      throw error;
    }
  }

  async #withLock<ReturnValue>(
    fn: () => Promise<ReturnValue>,
  ): Promise<ReturnValue> {
    const run = this.#lock.then(fn, fn);
    this.#lock = run.then(
      () => undefined,
      () => undefined,
    );
    return await run;
  }
}
