import type {
  ControllerGetStateAction,
  ControllerStateChangeEvent,
  StateMetadata,
} from '@metamask/base-controller';
import { BaseController } from '@metamask/base-controller';
import type { Messenger } from '@metamask/messenger';
import { areUint8ArraysEqual } from '@metamask/utils';

import {
  bytesToSecretHex,
  generateSigningKey,
  hash,
  randomId,
  sign,
} from './crypto.js';
import { MfaRecoveryError, MutationRepairPendingError } from './errors.js';
import { getIdentifierAuthMode } from './identifier-auth.js';
import type { MfaRecoveryControllerMethodActions } from './MfaRecoveryController-method-action-types.js';
import {
  assertAbortAllowed,
  assertSameAudienceIds,
  getRecoveryPhase,
} from './state-machine.js';
import type {
  AuthControllerToken,
  EscrowAuthChallenge,
  Identifier,
  IdentifierAuthorization,
  Mutation,
  MutationPayload,
  MutationReceipt,
  PendingOperation,
  PendingOperationEncryptor,
  RecoveryAuthProvider,
  RecoveryEscrowProvider,
  RecoveryIdentifierAuthProvider,
  RecoveryPhase,
  RegisterPayload,
  UpdateIdentifiersPayload,
  WritingPendingOperation,
} from './types.js';

export type {
  AuthControllerToken,
  EncryptedPendingOperation,
  Identifier,
  IdentifierAuthorization,
  Mutation,
  MutationPayload,
  MutationReceipt,
  PendingOperation,
  PendingOperationEncryptor,
  RecoveryAuthProvider,
  RecoveryEscrowProvider,
  RecoveryIdentifierAuthProvider,
  RecoveryPhase,
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

export type MfaRecoveryControllerStateChangeEvent = ControllerStateChangeEvent<
  typeof CONTROLLER_NAME,
  MfaRecoveryControllerState
>;

export type MfaRecoveryControllerEvents = MfaRecoveryControllerStateChangeEvent;

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
   * Collects a provider-specific response for an escrow-challenge identifier
   * (for example an Email/SMS OTP).
   */
  collectChallengeResponse: (
    challenge: EscrowAuthChallenge,
  ) => Promise<unknown>;

  /**
   * Clock used for AuthController token expiry checks. Defaults to `Date.now`.
   */
  now?: () => number;
};

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

  readonly #collectChallengeResponse: (
    challenge: EscrowAuthChallenge,
  ) => Promise<unknown>;

  readonly #now: () => number;

  #lock: Promise<void> = Promise.resolve();

  constructor({
    messenger,
    state,
    authProvider,
    identifierAuthProvider,
    escrows,
    pendingOperationEncryptor,
    collectChallengeResponse,
    now = (): number => Date.now(),
  }: MfaRecoveryControllerOptions) {
    if (escrows.length === 0) {
      throw new MfaRecoveryError(
        'At least one escrow is required',
        'empty_escrow_set',
      );
    }
    const ids = escrows.map((escrow) => escrow.id);
    if (new Set(ids).size !== ids.length) {
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
    this.#escrows = escrows;
    this.#encryptor = pendingOperationEncryptor;
    this.#collectChallengeResponse = collectChallengeResponse;
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
   * @param identifiers - Ownership-approved identifier set. Must be non-empty.
   */
  async register(
    recoverySecret: Uint8Array,
    identifiers: Identifier[],
  ): Promise<void> {
    this.#assertKnownIdentifierTypes(identifiers);
    if (identifiers.length === 0) {
      throw new MfaRecoveryError(
        'Registration requires at least one identifier',
        'empty_identifiers',
      );
    }
    await this.#runRecoveryMutation({
      operation: 'register',
      payload: {
        recoverySecret: bytesToSecretHex(recoverySecret),
        identifiers,
      },
      identifier: null,
    });
  }

  /**
   * Replaces the recovery secret.
   *
   * @param identifier - Currently registered identifier used to authorize.
   * @param recoverySecret - New secret.
   */
  async updateRecoverySecret(
    identifier: Identifier,
    recoverySecret: Uint8Array,
  ): Promise<void> {
    this.#assertKnownIdentifierTypes([identifier]);
    await this.#runRecoveryMutation({
      operation: 'updateRecoverySecret',
      payload: { recoverySecret: bytesToSecretHex(recoverySecret) },
      identifier,
    });
  }

  /**
   * Replaces the complete identifier set.
   *
   * @param identifier - Currently registered identifier used to authorize.
   * @param identifiers - New non-empty identifier set.
   */
  async updateIdentifiers(
    identifier: Identifier,
    identifiers: Identifier[],
  ): Promise<void> {
    this.#assertKnownIdentifierTypes([identifier, ...identifiers]);
    if (identifiers.length === 0) {
      throw new MfaRecoveryError(
        'Identifier list must be non-empty',
        'empty_identifiers',
      );
    }
    await this.#runRecoveryMutation({
      operation: 'updateIdentifiers',
      payload: { identifiers },
      identifier,
    });
  }

  /**
   * Reads the recovery secret from available escrows and returns the highest
   * consistent version.
   *
   * @param identifier - Identifier used to authorize the read.
   * @returns Recovered secret bytes.
   */
  async getRecoverySecret(identifier: Identifier): Promise<Uint8Array> {
    return await this.#withLock(async () => {
      this.#assertKnownIdentifierTypes([identifier]);
      const requestId = randomId();
      const requestHash = await hash({
        operation: 'getRecoverySecret',
        requestId,
      });
      const available = await this.#getAvailableEscrows();
      if (available.length === 0) {
        throw new MfaRecoveryError(
          'No escrow is available',
          'no_available_escrow',
        );
      }
      const authorizations = await this.#authorizeIdentifier({
        escrows: available,
        identifier,
        requestHash,
      });
      const results = await Promise.allSettled(
        available.map(async (escrow, index) => ({
          escrowId: escrow.id,
          ...(await escrow.getSecret(authorizations[index], requestId)),
        })),
      );
      return this.#selectHighestConsistentVersion(results).recoverySecret;
    });
  }

  /**
   * Completes a persisted pending mutation, if any.
   */
  async resume(): Promise<void> {
    await this.#withLock(async () => {
      await this.#repairPendingMutation(this.#escrows);
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

  async #runRecoveryMutation({
    operation,
    payload,
    identifier,
  }: {
    operation: Mutation['operation'];
    payload: MutationPayload;
    identifier: Identifier | null;
  }): Promise<void> {
    await this.#withLock(async () => {
      const configured = this.#escrows;
      await this.#repairPendingMutation(configured);
      const profileId = await this.#authProvider.getAuthenticatedProfileId();
      const targets = await this.#requireAllEscrows(configured);
      const audiences = configured.map((escrow) => escrow.id);
      const currentVersion = await this.#resolveCurrentRecoveryVersion({
        operation,
        profileId,
        targets,
      });
      const payloadHash = await hash(payload);
      const mutation = await this.#createMutation({
        id: randomId(),
        profileId,
        operation,
        expectedVersion: currentVersion,
        newVersion: currentVersion + 1,
        payloadHash,
        audiences,
      });

      await this.#persistPending({
        phase: 'authorizing',
        mutation,
        payload,
        identifier,
      });

      const authControllerToken = await this.#authorizeMutation(
        mutation,
        payload,
      );
      const pending: WritingPendingOperation = {
        phase: 'writing',
        mutation,
        authControllerToken,
        payload,
        identifier,
        receipts: [],
      };
      await this.#persistPending(pending);
      await this.#replicateMutation({ escrows: targets, pending });
    });
  }

  async #createMutation(
    fields: Omit<Mutation, 'requestHash'>,
  ): Promise<Mutation> {
    return {
      ...fields,
      requestHash: await hash({
        id: fields.id,
        profileId: fields.profileId,
        operation: fields.operation,
        expectedVersion: fields.expectedVersion,
        newVersion: fields.newVersion,
        payloadHash: fields.payloadHash,
        audiences: fields.audiences,
      }),
    };
  }

  async #authorizeMutation(
    mutation: Mutation,
    payload: MutationPayload,
  ): Promise<AuthControllerToken> {
    const identifiers =
      mutation.operation === 'register' ||
      mutation.operation === 'updateIdentifiers'
        ? (payload as RegisterPayload | UpdateIdentifiersPayload).identifiers
        : undefined;
    return await this.#authProvider.authorizeRecoveryRequest({
      requestHash: mutation.requestHash,
      ...(mutation.operation === 'register' ? {} : { requireTwoFactor: true }),
      ...(identifiers === undefined ? {} : { identifiers }),
    });
  }

  async #repairPendingMutation(
    escrows: RecoveryEscrowProvider[],
  ): Promise<void> {
    const saved = await this.#loadPending();
    if (!saved) {
      return;
    }
    assertSameAudienceIds(
      saved.mutation.audiences,
      escrows.map((escrow) => escrow.id),
    );
    const authControllerToken =
      saved.phase === 'authorizing' ||
      this.#tokenNeedsRefresh(saved.authControllerToken)
        ? await this.#authorizeMutation(saved.mutation, saved.payload)
        : saved.authControllerToken;
    const pending: WritingPendingOperation = {
      phase: 'writing',
      mutation: saved.mutation,
      authControllerToken,
      payload: saved.payload,
      identifier: saved.identifier,
      receipts: saved.phase === 'writing' ? saved.receipts : [],
    };
    await this.#persistPending(pending);
    await this.#replicateMutation({
      escrows: await this.#requireAllEscrows(escrows),
      pending,
    });
  }

  async #replicateMutation({
    escrows,
    pending,
  }: {
    escrows: RecoveryEscrowProvider[];
    pending: WritingPendingOperation;
  }): Promise<void> {
    const { mutation, payload, identifier } = pending;
    const expectedPayloadHash = await hash(payload);
    if (expectedPayloadHash !== mutation.payloadHash) {
      throw new MfaRecoveryError(
        'Pending payload does not match mutation',
        'payload_mismatch',
      );
    }
    const configuredIds = new Set(escrows.map((escrow) => escrow.id));
    pending.receipts.forEach((receipt) => {
      const escrow = escrows.find((item) => item.id === receipt.escrowId);
      if (!configuredIds.has(receipt.escrowId) || escrow === undefined) {
        throw new MfaRecoveryError(
          'Receipt escrow is not configured',
          'unknown_receipt_escrow',
        );
      }
      if (!escrow.verifyReceipt(receipt, mutation)) {
        throw new MfaRecoveryError(
          'Invalid mutation receipt',
          'invalid_receipt',
        );
      }
    });
    const acknowledged = new Set(
      pending.receipts.map((receipt) => receipt.escrowId),
    );
    const targets = escrows.filter((escrow) => !acknowledged.has(escrow.id));
    if (targets.length === 0) {
      await this.#clearPending();
      return;
    }
    const authorizations =
      mutation.operation === 'register'
        ? targets.map(() => null)
        : await this.#authorizeIdentifier({
            escrows: targets,
            identifier: identifier as Identifier,
            requestHash: mutation.requestHash,
          });
    const results = await Promise.allSettled(
      targets.map((escrow, index) =>
        escrow.applyMutation(
          mutation,
          pending.authControllerToken,
          authorizations[index],
          payload,
        ),
      ),
    );

    const receipts: MutationReceipt[] = [...pending.receipts];
    results.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        const escrow = targets[index];
        if (!escrow.verifyReceipt(result.value, mutation)) {
          throw new MfaRecoveryError(
            'Invalid mutation receipt',
            'invalid_receipt',
          );
        }
        receipts.push(result.value);
      }
    });
    await this.#persistPending({ ...pending, receipts });

    if (
      new Set(receipts.map((receipt) => receipt.escrowId)).size !==
      escrows.length
    ) {
      throw new MutationRepairPendingError(mutation.id);
    }
    await this.#clearPending();
  }

  async #authorizeIdentifier({
    escrows,
    identifier,
    requestHash,
  }: {
    escrows: RecoveryEscrowProvider[];
    identifier: Identifier;
    requestHash: string;
  }): Promise<IdentifierAuthorization[]> {
    const mode = getIdentifierAuthMode(identifier.type);
    if (mode === 'key-bound') {
      const proofKey = await generateSigningKey();
      const token =
        await this.#identifierAuthProvider.getKeyBoundIdentifierToken({
          identifier,
          proofPublicKey: proofKey.publicKey,
          requestHash,
        });
      const challenges = await Promise.all(
        escrows.map((escrow) => escrow.generateChallenge()),
      );
      return await Promise.all(
        challenges.map(async (challenge) => {
          const message = await hash([token, challenge.id, requestHash]);
          return {
            kind: 'key-bound' as const,
            token,
            proof: {
              challengeId: challenge.id,
              requestHash,
              signature: await sign(proofKey.privateKey, message),
            },
          };
        }),
      );
    }

    const challenges = await Promise.all(
      escrows.map((escrow) =>
        escrow.beginIdentifierAuthentication({ identifier, requestHash }),
      ),
    );
    const responses = await Promise.all(
      challenges.map((challenge) => this.#collectChallengeResponse(challenge)),
    );
    const grants = await Promise.all(
      escrows.map((escrow, index) =>
        escrow.completeIdentifierAuthentication(
          challenges[index].id,
          responses[index],
        ),
      ),
    );
    return grants.map((grant) => ({
      kind: 'escrow-challenge' as const,
      grant,
    }));
  }

  async #resolveCurrentRecoveryVersion({
    operation,
    profileId,
    targets,
  }: {
    operation: Mutation['operation'];
    profileId: string;
    targets: RecoveryEscrowProvider[];
  }): Promise<number> {
    const metadatas = await Promise.all(
      targets.map((escrow) => escrow.getRecoveryMetadata(profileId)),
    );
    if (operation === 'register') {
      if (metadatas.some((metadata) => metadata !== null)) {
        throw new MfaRecoveryError(
          'Profile is already registered',
          'already_registered',
        );
      }
      return 0;
    }
    const present = metadatas.filter(
      (metadata): metadata is NonNullable<typeof metadata> => metadata !== null,
    );
    if (present.length !== metadatas.length) {
      throw new MfaRecoveryError(
        'Recovery record missing at a configured escrow',
        'missing_record',
      );
    }
    const selected = present[0];
    if (
      !present.every(
        (metadata) =>
          metadata.version === selected.version &&
          metadata.lastMutationId === selected.lastMutationId,
      )
    ) {
      throw new MfaRecoveryError(
        'Escrows disagree on recovery version',
        'version_divergence',
      );
    }
    return selected.version;
  }

  #selectHighestConsistentVersion(
    results: PromiseSettledResult<{
      escrowId: string;
      recoverySecret: Uint8Array;
      version: number;
      lastMutationId: string;
    }>[],
  ): { recoverySecret: Uint8Array; version: number; lastMutationId: string } {
    const responses = results
      .filter((result) => result.status === 'fulfilled')
      .map((result) => result.value);
    if (responses.length === 0) {
      throw new MfaRecoveryError(
        'No escrow returned a recovery secret',
        'read_failed',
      );
    }
    const highestVersion = Math.max(
      ...responses.map((response) => response.version),
    );
    const highest = responses.filter(
      (response) => response.version === highestVersion,
    );
    const selected = highest[0];
    if (
      !highest.every(
        (response) =>
          response.lastMutationId === selected.lastMutationId &&
          areUint8ArraysEqual(response.recoverySecret, selected.recoverySecret),
      )
    ) {
      throw new MfaRecoveryError('Replica corruption', 'replica_corruption');
    }
    return selected;
  }

  async #getAvailableEscrows(): Promise<RecoveryEscrowProvider[]> {
    const flags = await Promise.all(
      this.#escrows.map(async (escrow) => ({
        escrow,
        available: await escrow.isAvailable(),
      })),
    );
    return flags.filter((item) => item.available).map((item) => item.escrow);
  }

  async #requireAllEscrows(
    escrows: RecoveryEscrowProvider[],
  ): Promise<RecoveryEscrowProvider[]> {
    const available = await Promise.all(
      escrows.map(async (escrow) => ({
        escrow,
        available: await escrow.isAvailable(),
      })),
    );
    if (available.some((item) => !item.available)) {
      throw new MfaRecoveryError(
        'All configured escrows are required for mutation',
        'escrow_unavailable',
      );
    }
    return escrows;
  }

  #tokenNeedsRefresh(token: AuthControllerToken): boolean {
    return token.expiresAt <= this.#now();
  }

  #assertKnownIdentifierTypes(identifiers: Identifier[]): void {
    for (const identifier of identifiers) {
      getIdentifierAuthMode(identifier.type);
    }
  }

  async #loadPending(): Promise<PendingOperation | null> {
    const { pendingOperation } = this.state;
    if (pendingOperation === null) {
      return null;
    }
    return await this.#encryptor.decrypt(pendingOperation);
  }

  async #persistPending(operation: PendingOperation): Promise<void> {
    const encrypted = await this.#encryptor.encrypt(operation);
    this.update((state) => {
      state.pendingOperation = encrypted;
    });
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
