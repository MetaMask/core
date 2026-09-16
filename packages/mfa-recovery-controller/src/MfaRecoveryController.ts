import type {
  ControllerGetStateAction,
  ControllerStateChangedEvent,
  StateMetadata,
} from '@metamask/base-controller';
import { BaseController } from '@metamask/base-controller';
import type { Messenger } from '@metamask/messenger';
import { bytesToHex } from '@metamask/utils';

import {
  decodeHex,
  decryptFromPublic,
  encryptToPublic,
  generateSigningKey,
  hash,
  randomId,
  unixNow,
  wrapKeyId,
} from './crypto.js';
import { IncompleteMutationError, MfaRecoveryError } from './errors.js';
import {
  isFulfilledResult,
  isMutationReceipt,
  selectHighestConsistentVersion,
  verifyMutationReceipt,
} from './escrow-utils.js';
import {
  authorizeKeyBoundIdentifier,
  getIdentifierAuthMode,
  MIN_IDENTIFIERS,
} from './identifier-auth.js';
import type { AuthorizedEscrow } from './identifier-auth.js';
import type { MfaRecoveryControllerMethodActions } from './MfaRecoveryController-method-action-types.js';
import {
  assertValidPendingOperation,
  pendingPayloadHasIdentifiers,
  pendingPayloadHasRecoverySecret,
} from './pending-operation-validation.js';
import { assertAbortAllowed, getRecoveryPhase } from './state-machine.js';
import type {
  AuthControllerToken,
  EcPublicJwk,
  Identifier,
  Mutation,
  MutationPayload,
  MutationReceipt,
  PendingMutationPayload,
  PendingOperation,
  PendingOperationEncryptor,
  PendingRegisterPayload,
  PendingUpdateIdentifiersPayload,
  PendingUpdateRecoverySecretPayload,
  RecoveryAuthProvider,
  RecoveryEscrowProvider,
  RecoveryIdentifierAuthProvider,
  RecoveryPhase,
  RecoveredSecret,
  WrappedSecret,
  WritingPendingOperation,
} from './types.js';

const CONTROLLER_NAME = 'MfaRecoveryController';

const MESSENGER_EXPOSED_METHODS = [
  'register',
  'updateRecoverySecret',
  'updateIdentifiers',
  'getRecoverySecret',
  'resume',
  'abort',
  'getPhase',
] as const;

export type MfaRecoveryControllerState = {
  /**
   * Encrypted pending mutation, or `null` when idle.
   */
  pendingOperation: string | null;
};

const mfaRecoveryControllerMetadata = {
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
  return { pendingOperation: null };
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

  readonly #identifierAuthProvider: RecoveryIdentifierAuthProvider;

  readonly #escrows: RecoveryEscrowProvider[];

  readonly #encryptor: PendingOperationEncryptor;

  readonly #now: () => number;

  #lock: Promise<void> = Promise.resolve();

  constructor({
    messenger,
    state,
    authProvider,
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
    this.#assertKnownIdentifierTypes(identifiers);
    this.#assertMinIdentifiers(identifiers);
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
    this.#assertKnownIdentifierTypes([identifier]);
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
    this.#assertKnownIdentifierTypes([identifier, ...identifiers]);
    this.#assertMinIdentifiers(identifiers);
    await this.#mutate({
      operation: 'updateIdentifiers',
      payload: { identifiers },
      identifier,
      epoch,
    });
  }

  /**
   * Reads the recovery secret from available escrows and returns the highest
   * consistent version. `epoch` is the current recovery version and is required
   * by later mutations.
   *
   * @param identifier - Identifier used to authorize the read.
   * @returns Recovered secret bytes and the selected epoch.
   */
  async getRecoverySecret(identifier: Identifier): Promise<RecoveredSecret> {
    return await this.#withLock(async () => {
      this.#assertKnownIdentifierTypes([identifier]);
      const requestId = randomId();
      const ephemeral = generateSigningKey();
      const pkE = JSON.parse(ephemeral.publicKey) as EcPublicJwk;
      const requestHash = hash({
        operation: 'getRecoverySecret',
        requestId,
        pkE,
      });
      const available = await this.#getAvailableEscrows();
      if (available.length === 0) {
        throw new MfaRecoveryError(
          'No escrow is available',
          'no_available_escrow',
        );
      }
      const authorizedEscrows = await this.#authorizeIdentifier({
        escrows: available,
        identifier,
        requestHash,
      });
      const results = await Promise.allSettled(
        authorizedEscrows.map(async ({ escrow, authorization }) => {
          const response = await escrow.getSecret(
            authorization,
            requestId,
            pkE,
          );
          if (response.wrapKeyId !== wrapKeyId(escrow.wrapPublicKey)) {
            throw new MfaRecoveryError(
              'Unexpected wrap key',
              'wrap_key_mismatch',
            );
          }
          return {
            escrowId: escrow.id,
            recoverySecret: decryptFromPublic(
              ephemeral.privateKey,
              escrow.wrapPublicKey,
              response.recoverySecret.ciphertext,
            ),
            version: response.version,
            lastMutationId: response.lastMutationId,
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
   * Completes a persisted pending mutation, if any.
   */
  async resume(): Promise<void> {
    await this.#withLock(async () => {
      await this.#repairPendingMutation();
    });
  }

  /**
   * Drops a mutation that has not yet begun writing. Writing mutations must be
   * resumed instead.
   */
  async abort(): Promise<void> {
    await this.#withLock(async () => {
      const pending = await this.#loadPending();
      assertAbortAllowed(getRecoveryPhase(pending));
      if (pending) {
        await this.#clearPending();
      }
    });
  }

  /**
   * @returns Current recovery phase.
   */
  async getPhase(): Promise<RecoveryPhase> {
    return getRecoveryPhase(await this.#loadPending());
  }

  async #mutate(params: MutateParams): Promise<void> {
    const { operation, payload, identifier, epoch } = params;
    await this.#withLock(async () => {
      await this.#repairPendingMutation();

      const profileId = await this.#authProvider.getAuthenticatedProfileId();
      const audiences = this.#escrows.map((escrow) => escrow.id);
      const currentVersion = this.#resolveCurrentRecoveryVersion(epoch);
      const payloadHash = hash(payload);

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
        requestHash: hash(mutationFields),
      };

      const pending: PendingOperation = {
        phase: 'authorizing',
        mutation,
        payload,
        identifier,
      };
      await this.#persistPending(pending);

      const authControllerToken = await this.#authorizeMutation(
        mutation,
        payload,
      );
      await this.#replicateMutation({
        ...pending,
        phase: 'writing',
        authControllerToken,
        receipts: [],
      });
    });
  }

  async #authorizeMutation(
    mutation: Mutation,
    payload: PendingMutationPayload,
  ): Promise<AuthControllerToken> {
    return await this.#authProvider.authorizeRecoveryRequest({
      requestHash: mutation.requestHash,
      ...(mutation.operation === 'register' ? {} : { requireTwoFactor: true }),
      ...(pendingPayloadHasIdentifiers(payload)
        ? { identifiers: payload.identifiers }
        : {}),
    });
  }

  async #repairPendingMutation(): Promise<void> {
    const pending = await this.#loadPending();
    if (!pending) {
      return;
    }

    if (pending.phase === 'authorizing') {
      await this.#replicateMutation({
        ...pending,
        phase: 'writing',
        authControllerToken: await this.#authorizeMutation(
          pending.mutation,
          pending.payload,
        ),
        receipts: [],
      });
      return;
    }

    // writing phase
    await this.#replicateMutation(pending);
  }

  async #replicateMutation(pending: WritingPendingOperation): Promise<void> {
    const { mutation, payload, identifier } = pending;
    const remainingEscrows = this.#getRemainingEscrows(pending);
    if (remainingEscrows.length === 0) {
      await this.#clearPending();
      return;
    }

    const availableEscrows = await this.#getAvailableEscrows(remainingEscrows);
    if (availableEscrows.length !== remainingEscrows.length) {
      throw new MfaRecoveryError(
        'All configured escrows are required for mutation',
        'escrow_unavailable',
      );
    }

    const authControllerToken =
      pending.authControllerToken.expiresAt <= this.#now()
        ? await this.#authorizeMutation(mutation, payload)
        : pending.authControllerToken;
    const writing = { ...pending, authControllerToken };
    const authorizedEscrows =
      mutation.operation === 'register'
        ? null
        : await this.#authorizeIdentifier({
            escrows: remainingEscrows,
            identifier: identifier as Identifier,
            requestHash: mutation.requestHash,
          });
    if (
      authorizedEscrows !== null &&
      authorizedEscrows.length !== remainingEscrows.length
    ) {
      throw new MfaRecoveryError(
        'Unable to authorize every escrow',
        'identifier_auth_failed',
      );
    }
    const payloads = remainingEscrows.map((escrow) =>
      this.#payloadForEscrow(writing, escrow),
    );

    await this.#persistPending(writing);
    const results = await Promise.allSettled(
      remainingEscrows.map((escrow, index) =>
        escrow.applyMutation(
          mutation,
          writing.authControllerToken,
          authorizedEscrows?.[index]?.authorization ?? null,
          payloads[index],
        ),
      ),
    );

    const { receipts, hasInvalidReceipt } = this.#collectMutationReceipts(
      results,
      remainingEscrows,
      mutation,
      writing.receipts,
    );
    await this.#persistPending({ ...writing, receipts });

    if (hasInvalidReceipt) {
      throw new MfaRecoveryError('Invalid mutation receipt', 'invalid_receipt');
    }

    if (
      new Set(receipts.map((receipt) => receipt.escrowId)).size !==
      this.#escrows.length
    ) {
      throw new IncompleteMutationError(mutation.id);
    }
    await this.#clearPending();
  }

  #getRemainingEscrows(
    pending: WritingPendingOperation,
  ): RecoveryEscrowProvider[] {
    const { mutation } = pending;
    const remainingEscrows: RecoveryEscrowProvider[] = [];
    for (const escrow of this.#escrows) {
      const receipt = pending.receipts.find(
        (item) => item.escrowId === escrow.id,
      );
      if (receipt === undefined) {
        remainingEscrows.push(escrow);
        continue;
      }
      if (!verifyMutationReceipt(receipt, mutation, escrow)) {
        throw new MfaRecoveryError(
          'Invalid mutation receipt',
          'invalid_receipt',
        );
      }
    }
    if (
      remainingEscrows.length + pending.receipts.length !==
      this.#escrows.length
    ) {
      throw new MfaRecoveryError(
        'Receipt escrow is not configured',
        'unknown_receipt_escrow',
      );
    }
    return remainingEscrows;
  }

  #collectMutationReceipts(
    results: PromiseSettledResult<MutationReceipt>[],
    escrows: RecoveryEscrowProvider[],
    mutation: Mutation,
    existingReceipts: MutationReceipt[],
  ): { receipts: MutationReceipt[]; hasInvalidReceipt: boolean } {
    const receipts = [...existingReceipts];
    let hasInvalidReceipt = false;
    results.forEach((result, index) => {
      if (!isFulfilledResult(result)) {
        return;
      }
      const escrow = escrows[index];
      if (
        !isMutationReceipt(result.value) ||
        !verifyMutationReceipt(result.value, mutation, escrow)
      ) {
        hasInvalidReceipt = true;
        return;
      }
      receipts.push(result.value);
    });
    return { receipts, hasInvalidReceipt };
  }

  async #authorizeIdentifier({
    escrows,
    identifier,
    requestHash,
  }: {
    escrows: RecoveryEscrowProvider[];
    identifier: Identifier;
    requestHash: string;
  }): Promise<AuthorizedEscrow[]> {
    getIdentifierAuthMode(identifier.type);
    return await authorizeKeyBoundIdentifier({
      escrows,
      identifier,
      requestHash,
      identifierAuthProvider: this.#identifierAuthProvider,
    });
  }

  #payloadForEscrow(
    pending: WritingPendingOperation,
    escrow: RecoveryEscrowProvider,
  ): MutationPayload {
    const { payload } = pending;
    if (!pendingPayloadHasRecoverySecret(payload)) {
      return {
        identifiers: payload.identifiers,
      };
    }
    const recoverySecret = this.#wrapRecoverySecret(
      decodeHex(payload.recoverySecret),
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

  #assertKnownIdentifierTypes(identifiers: Identifier[]): void {
    for (const identifier of identifiers) {
      getIdentifierAuthMode(identifier.type);
    }
  }

  #assertMinIdentifiers(identifiers: Identifier[]): void {
    if (identifiers.length < MIN_IDENTIFIERS) {
      throw new MfaRecoveryError(
        `Requires at least ${MIN_IDENTIFIERS} identifiers`,
        'empty_identifiers',
      );
    }
  }

  #wrapRecoverySecret(
    plaintext: Uint8Array,
    wrapPublicKey: string,
  ): WrappedSecret {
    const ephemeral = generateSigningKey();
    return {
      pkE: JSON.parse(ephemeral.publicKey) as EcPublicJwk,
      ciphertext: encryptToPublic(
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
