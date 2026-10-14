import type {
  ControllerGetStateAction,
  ControllerStateChangedEvent,
  StateMetadata,
} from '@metamask/base-controller';
import { BaseController } from '@metamask/base-controller';
import type { Messenger } from '@metamask/messenger';
import { bytesToHex } from '@metamask/utils';

import { decodeAuthControllerToken } from './auth-controller-token.js';
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
import {
  IncompleteMutationError,
  MfaRecoveryError,
  MutationRejectedError,
} from './errors.js';
import {
  isFulfilledResult,
  isMutationReceipt,
  selectHighestConsistentVersion,
  verifyMutationReceipt,
} from './escrow-utils.js';
import {
  authorizeEscrowsWithToken,
  countDistinctIdentifiers,
  getIdentifierAuthMode,
  MIN_IDENTIFIERS,
  requestKeyBoundIdentifierToken,
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
  IdentifierSession,
  Mutation,
  MutationPayload,
  MutationReceipt,
  MutationStatus,
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
import { withTimeout } from './with-timeout.js';

const CONTROLLER_NAME = 'MfaRecoveryController';

const DEFAULT_PROMPT_TIMEOUT_MS = 300_000;

const DEFAULT_REQUEST_TIMEOUT_MS = 30_000;

const MESSENGER_EXPOSED_METHODS = [
  'register',
  'updateRecoverySecret',
  'updateIdentifiers',
  'authenticateIdentifier',
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

  /**
   * Upper bound for user-facing prompts (AuthController authorization and
   * identifier IdP prompts), in milliseconds. Defaults to 5 minutes.
   */
  promptTimeoutMs?: number;

  /**
   * Upper bound for each network or storage request (escrow calls, profile
   * lookup, pending-state encryption), in milliseconds. Defaults to 30 seconds.
   */
  requestTimeoutMs?: number;
};

type InFlightOperation = {
  controller: AbortController;
  applying: boolean;
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

  readonly #promptTimeoutMs: number;

  readonly #requestTimeoutMs: number;

  #lock: Promise<void> = Promise.resolve();

  #inFlight: InFlightOperation | null = null;

  /**
   * Advanced by {@link abort}. Operations queued under an older generation
   * fail before starting external work.
   */
  #abortGeneration = 0;

  constructor({
    messenger,
    state,
    authProvider,
    identifierAuthProvider,
    escrows,
    pendingOperationEncryptor,
    now = unixNow,
    promptTimeoutMs = DEFAULT_PROMPT_TIMEOUT_MS,
    requestTimeoutMs = DEFAULT_REQUEST_TIMEOUT_MS,
  }: MfaRecoveryControllerOptions) {
    assertValidTimeout(promptTimeoutMs);
    assertValidTimeout(requestTimeoutMs);
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
    this.#promptTimeoutMs = promptTimeoutMs;
    this.#requestTimeoutMs = requestTimeoutMs;

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
   * Authenticates an identifier for a subsequent recovery-secret read.
   *
   * @param identifier - Identifier to authenticate.
   * @returns Ephemeral session data required by {@link getRecoverySecret}.
   */
  async authenticateIdentifier(
    identifier: Identifier,
  ): Promise<IdentifierSession> {
    this.#assertKnownIdentifierTypes([identifier]);
    const requestId = randomId();
    const ephemeral = generateSigningKey();
    const pkE = JSON.parse(ephemeral.publicKey) as EcPublicJwk;
    const requestHash = hash({
      operation: 'getRecoverySecret',
      requestId,
      pkE,
    });
    const credential = await requestKeyBoundIdentifierToken({
      identifier,
      requestHash,
      identifierAuthProvider: this.#identifierAuthProvider,
      timeoutMs: this.#promptTimeoutMs,
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
    const { token, requestId, pkE } = session;
    this.#assertKnownIdentifierTypes([token.identifier]);
    const requestHash = hash({
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
    const authorizedEscrows = await authorizeEscrowsWithToken({
      escrows: available,
      credential: session,
      timeoutMs: this.#requestTimeoutMs,
    });
    const results = await Promise.allSettled(
      authorizedEscrows.map(async ({ escrow, authorization }) => {
        const response = await withTimeout(
          (signal) =>
            escrow.getSecret(authorization, requestId, pkE, { signal }),
          { ms: this.#requestTimeoutMs, kind: 'request' },
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
            session.ephemeralPrivateKey,
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
  }

  /**
   * Completes a persisted pending mutation, if any.
   */
  async resume(): Promise<void> {
    await this.#withInFlightOperation(async (inFlight) => {
      await this.#repairPendingMutation(inFlight);
    });
  }

  /**
   * Drops `authorizing` pending. `writing` must be finished with {@link resume}.
   *
   * Cancels an in-flight operation that has not started writing to escrows.
   */
  async abort(): Promise<void> {
    if (this.#inFlight?.applying) {
      throw new MfaRecoveryError(
        'Cannot abort while a mutation is being written',
        'abort_not_allowed',
      );
    }
    this.#abortGeneration += 1;
    this.#inFlight?.controller.abort();
    await this.#withLock(async () => {
      const pending = await this.#loadPending();
      assertAbortAllowed(pending);
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
    await this.#withInFlightOperation(async (inFlight) => {
      const { signal } = inFlight.controller;
      if (await this.#loadPending(signal)) {
        throw new MfaRecoveryError(
          'A pending mutation must be resumed or aborted first',
          'pending_mutation',
        );
      }

      const profileId = await withTimeout(
        (childSignal) =>
          this.#authProvider.getAuthenticatedProfileId({ signal: childSignal }),
        { ms: this.#requestTimeoutMs, signal, kind: 'request' },
      );
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
      await this.#persistPending(pending, signal);

      const authControllerToken = await this.#authorizeMutation(
        mutation,
        payload,
        signal,
      );
      await this.#replicateMutation(
        {
          ...pending,
          phase: 'writing',
          authControllerToken,
          receipts: [],
          dispatchedEscrowIds: [],
        },
        inFlight,
      );
    });
  }

  async #authorizeMutation(
    mutation: Mutation,
    payload: PendingMutationPayload,
    signal: AbortSignal,
  ): Promise<AuthControllerToken> {
    return await withTimeout(
      (childSignal) =>
        this.#authProvider.authorizeRecoveryRequest({
          requestHash: mutation.requestHash,
          audiences: this.#escrows.map((escrow) => escrow.authAudience),
          ...(mutation.operation === 'register'
            ? {}
            : { requireTwoFactor: true }),
          ...(pendingPayloadHasIdentifiers(payload)
            ? { identifiers: payload.identifiers }
            : {}),
          signal: childSignal,
        }),
      { ms: this.#promptTimeoutMs, signal, kind: 'prompt' },
    );
  }

  async #repairPendingMutation(inFlight: InFlightOperation): Promise<void> {
    const { signal } = inFlight.controller;
    const pending = await this.#loadPending(signal);
    if (!pending) {
      return;
    }

    if (pending.phase === 'authorizing') {
      await this.#replicateMutation(
        {
          ...pending,
          phase: 'writing',
          authControllerToken: await this.#authorizeMutation(
            pending.mutation,
            pending.payload,
            signal,
          ),
          receipts: [],
          dispatchedEscrowIds: [],
        },
        inFlight,
      );
      return;
    }

    // writing phase
    await this.#replicateMutation(pending, inFlight);
  }

  async #replicateMutation(
    pending: WritingPendingOperation,
    inFlight: InFlightOperation,
  ): Promise<void> {
    const { signal } = inFlight.controller;
    const { mutation, payload, identifier } = pending;
    const remainingEscrows = this.#getRemainingEscrows(pending);
    if (remainingEscrows.length === 0) {
      await this.#clearPending();
      return;
    }

    const availableEscrows = await this.#getAvailableEscrows(
      remainingEscrows,
      signal,
    );
    if (availableEscrows.length !== remainingEscrows.length) {
      throw new MfaRecoveryError(
        'All configured escrows are required for mutation',
        'escrow_unavailable',
      );
    }

    const claims = decodeAuthControllerToken(pending.authControllerToken);
    const authControllerToken =
      claims && claims.exp > this.#now()
        ? pending.authControllerToken
        : await this.#authorizeMutation(mutation, payload, signal);
    const remainingIds = remainingEscrows.map((escrow) => escrow.id);
    const previouslyDispatched = new Set(pending.dispatchedEscrowIds);
    const firstSendIds = new Set(
      remainingIds.filter((id) => !previouslyDispatched.has(id)),
    );
    const writing = {
      ...pending,
      authControllerToken,
      dispatchedEscrowIds: [
        ...new Set([...pending.dispatchedEscrowIds, ...remainingIds]),
      ],
    };
    const authorizedEscrows =
      mutation.operation === 'register'
        ? null
        : await this.#authorizeEscrows({
            escrows: remainingEscrows,
            identifier: identifier as Identifier,
            requestHash: mutation.requestHash,
            signal,
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

    await this.#persistPending(writing, signal);
    throwIfAborted(signal);
    inFlight.applying = true;
    const results = await Promise.allSettled(
      remainingEscrows.map((escrow, index) =>
        withTimeout(
          (applySignal) =>
            escrow.applyMutation(
              mutation,
              writing.authControllerToken,
              authorizedEscrows?.[index]?.authorization ?? null,
              payloads[index],
              { signal: applySignal },
            ),
          { ms: this.#requestTimeoutMs, kind: 'request' },
        ),
      ),
    );

    const { receipts, hasInvalidReceipt, rejection } =
      await this.#classifyApplyResults({
        results,
        escrows: remainingEscrows,
        mutation,
        existingReceipts: writing.receipts,
        firstSendIds,
      });
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

  /**
   * Turns settled apply results into receipts and a final decision.
   *
   * A refusal clears the pending mutation only when it proves the mutation was
   * not applied: the first send to that escrow, or a status probe reporting it
   * was not applied. Any other refusal, or a failed probe, is ambiguous.
   *
   * @param params - Settled apply results and context.
   * @param params.results - Settled `applyMutation` results.
   * @param params.escrows - Escrows that were sent the mutation, in order.
   * @param params.mutation - Mutation being applied.
   * @param params.existingReceipts - Receipts stored before this attempt.
   * @param params.firstSendIds - Escrow ids that were first sent in this attempt.
   * @returns Receipts to store, whether any receipt was invalid, and the
   * rejection to throw when every escrow proves it did not apply the mutation.
   */
  async #classifyApplyResults({
    results,
    escrows,
    mutation,
    existingReceipts,
    firstSendIds,
  }: {
    results: PromiseSettledResult<MutationReceipt>[];
    escrows: RecoveryEscrowProvider[];
    mutation: Mutation;
    existingReceipts: MutationReceipt[];
    firstSendIds: Set<string>;
  }): Promise<{
    receipts: MutationReceipt[];
    hasInvalidReceipt: boolean;
    rejection: MutationRejectedError | undefined;
  }> {
    const outcomes = await Promise.all(
      results.map(
        async (result, index) =>
          await this.#resolveApplyOutcome({
            result,
            escrow: escrows[index],
            mutation,
            firstSend: firstSendIds.has(escrows[index].id),
          }),
      ),
    );
    const receipts = [...existingReceipts];
    let hasInvalidReceipt = false;
    const rejections: MutationRejectedError[] = [];
    for (const outcome of outcomes) {
      if (outcome.kind === 'receipt') {
        receipts.push(outcome.receipt);
      } else if (outcome.kind === 'invalid') {
        hasInvalidReceipt = true;
      } else if (outcome.kind === 'notApplied') {
        rejections.push(outcome.rejection);
      }
    }
    const [firstRejection] = rejections;
    const allNotApplied =
      existingReceipts.length === 0 && rejections.length === outcomes.length;
    return {
      receipts,
      hasInvalidReceipt,
      rejection: allNotApplied ? firstRejection : undefined,
    };
  }

  /**
   * @param params - Settled apply result for one escrow.
   * @param params.result - The settled `applyMutation` result.
   * @param params.escrow - The escrow that was sent the mutation.
   * @param params.mutation - Mutation being applied.
   * @param params.firstSend - Whether this attempt was the first send to escrow.
   * @returns What the result proves about this escrow.
   */
  async #resolveApplyOutcome({
    result,
    escrow,
    mutation,
    firstSend,
  }: {
    result: PromiseSettledResult<MutationReceipt>;
    escrow: RecoveryEscrowProvider;
    mutation: Mutation;
    firstSend: boolean;
  }): Promise<ApplyOutcome> {
    if (isFulfilledResult(result)) {
      return toReceiptOutcome(result.value, mutation, escrow);
    }
    const reason: unknown = result.reason;
    if (!(reason instanceof MutationRejectedError)) {
      return { kind: 'ambiguous' };
    }
    if (firstSend) {
      return { kind: 'notApplied', rejection: reason };
    }
    const probe = escrow.getMutationStatus?.bind(escrow);
    if (probe === undefined) {
      return { kind: 'ambiguous' };
    }
    let status: MutationStatus;
    try {
      status = await withTimeout((signal) => probe(mutation, { signal }), {
        ms: this.#requestTimeoutMs,
        kind: 'request',
      });
    } catch {
      return { kind: 'ambiguous' };
    }
    if (!status.applied) {
      return { kind: 'notApplied', rejection: reason };
    }
    return toReceiptOutcome(status.receipt, mutation, escrow);
  }

  async #authorizeEscrows({
    escrows,
    identifier,
    requestHash,
    signal,
  }: {
    escrows: RecoveryEscrowProvider[];
    identifier: Identifier;
    requestHash: string;
    signal: AbortSignal;
  }): Promise<AuthorizedEscrow[]> {
    getIdentifierAuthMode(identifier.type);
    const credential = await requestKeyBoundIdentifierToken({
      identifier,
      requestHash,
      identifierAuthProvider: this.#identifierAuthProvider,
      signal,
      timeoutMs: this.#promptTimeoutMs,
    });
    return await authorizeEscrowsWithToken({
      escrows,
      credential,
      signal,
      timeoutMs: this.#requestTimeoutMs,
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
    signal?: AbortSignal,
  ): Promise<RecoveryEscrowProvider[]> {
    const flags = await Promise.allSettled(
      escrows.map(async (escrow) => ({
        escrow,
        available: await withTimeout(
          (childSignal) => escrow.isAvailable({ signal: childSignal }),
          { ms: this.#requestTimeoutMs, signal, kind: 'request' },
        ),
      })),
    );
    throwIfAborted(signal);
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
    if (countDistinctIdentifiers(identifiers) < MIN_IDENTIFIERS) {
      throw new MfaRecoveryError(
        `Requires at least ${MIN_IDENTIFIERS} identifiers`,
        'too_few_identifiers',
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

  async #loadPending(signal?: AbortSignal): Promise<PendingOperation | null> {
    const { pendingOperation } = this.state;
    if (pendingOperation === null) {
      return null;
    }
    const pending = (await withTimeout(
      async () => await this.#encryptor.decrypt(pendingOperation),
      { ms: this.#requestTimeoutMs, signal, kind: 'request' },
    )) as unknown;
    await this.#assertPending(pending);
    const loaded = pending as PendingOperation;
    if (
      loaded.phase === 'writing' &&
      loaded.dispatchedEscrowIds === undefined
    ) {
      // Records written before send tracking: assume every escrow was sent.
      return {
        ...loaded,
        dispatchedEscrowIds: this.#escrows.map((escrow) => escrow.id),
      };
    }
    return loaded;
  }

  /**
   * @param operation - Pending operation to encrypt and store.
   * @param signal - Cancels the write before it is stored. Omit once escrow
   * writes may have started, so cancellation cannot drop a writing record.
   */
  async #persistPending(
    operation: PendingOperation,
    signal?: AbortSignal,
  ): Promise<void> {
    await this.#assertPending(operation);
    const encrypted = await withTimeout(
      async () => await this.#encryptor.encrypt(operation),
      { ms: this.#requestTimeoutMs, signal, kind: 'request' },
    );
    throwIfAborted(signal);
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

  async #withInFlightOperation<ReturnValue>(
    fn: (inFlight: InFlightOperation) => Promise<ReturnValue>,
  ): Promise<ReturnValue> {
    const generation = this.#abortGeneration;
    return await this.#withLock(async () => {
      if (generation !== this.#abortGeneration) {
        throw new MfaRecoveryError('Operation aborted', 'operation_aborted');
      }
      const inFlight: InFlightOperation = {
        controller: new AbortController(),
        applying: false,
      };
      this.#inFlight = inFlight;
      try {
        return await fn(inFlight);
      } finally {
        this.#inFlight = null;
      }
    });
  }
}

/**
 * @param value - Timeout option in milliseconds.
 * @throws If `value` is not a positive integer.
 */
function assertValidTimeout(value: number): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw new MfaRecoveryError(
      'Timeout must be a positive integer',
      'invalid_timeout',
    );
  }
}

/**
 * @param signal - Operation signal, if any.
 * @throws `operation_aborted` when `signal` has been aborted.
 */
function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new MfaRecoveryError('Operation aborted', 'operation_aborted');
  }
}

/**
 * What one escrow's apply result proves about the mutation.
 */
type ApplyOutcome =
  | { kind: 'receipt'; receipt: MutationReceipt }
  | { kind: 'invalid' }
  | { kind: 'notApplied'; rejection: MutationRejectedError }
  | { kind: 'ambiguous' };

/**
 * @param value - Value returned by an escrow or its status call.
 * @param mutation - Mutation the receipt must acknowledge.
 * @param escrow - Escrow the receipt must come from.
 * @returns A receipt outcome when the value verifies, otherwise `invalid`.
 */
function toReceiptOutcome(
  value: unknown,
  mutation: Mutation,
  escrow: RecoveryEscrowProvider,
): ApplyOutcome {
  if (
    !isMutationReceipt(value) ||
    !verifyMutationReceipt(value, mutation, escrow)
  ) {
    return { kind: 'invalid' };
  }
  return { kind: 'receipt', receipt: value };
}
