import {
  canonicalizeIdentifiers,
  hash,
  hashMutationReceipt,
  secretHexToBytes,
  verifySignature,
} from '../src/crypto.js';
import { MfaRecoveryError } from '../src/errors.js';
import { getIdentifierAuthMode } from '../src/identifier-auth.js';
import type {
  AuthControllerToken,
  EscrowAuthChallenge,
  EscrowIdentifierGrant,
  Identifier,
  IdentifierAuthorization,
  KeyBoundIdentifierToken,
  Mutation,
  MutationPayload,
  MutationReceipt,
  PendingOperation,
  PendingOperationEncryptor,
  PoPChallenge,
  RecoveryAuthProvider,
  RecoveryEscrowProvider,
  RecoveryIdentifierAuthProvider,
  RecoveryRecordMetadata,
  RecoverySecretResponse,
  RegisterPayload,
  UpdateIdentifiersPayload,
  UpdateRecoverySecretPayload,
} from '../src/types.js';

type RecoveryRecord = {
  profileId: string;
  identifiers: Identifier[];
  recoverySecret: string;
  version: number;
  lastMutationId: string;
  appliedMutations: Record<string, { requestHash: string; version: number }>;
};

type StoredPoPChallenge = PoPChallenge & { consumed: boolean };

type StoredEscrowAuth = EscrowAuthChallenge & {
  completed: boolean;
  consumed: boolean;
  grant?: EscrowIdentifierGrant;
};

const CHALLENGE_TTL_MS = 5 * 60 * 1000;

/**
 * In-memory AuthController used in tests.
 */
export class StubAuthProvider implements RecoveryAuthProvider {
  profileId = 'profile-1';

  now: () => number = () => Date.now();

  async getAuthenticatedProfileId(): Promise<string> {
    return this.profileId;
  }

  async authorizeRecoveryRequest(params: {
    requestHash: string;
    requireTwoFactor?: boolean;
    identifiers?: Identifier[];
  }): Promise<AuthControllerToken> {
    const identifiersHash =
      params.identifiers === undefined
        ? undefined
        : await hash(canonicalizeIdentifiers(params.identifiers));
    return {
      profileId: this.profileId,
      requestHash: params.requestHash,
      ...(params.requireTwoFactor ? { twoFactor: true as const } : {}),
      ...(identifiersHash === undefined
        ? {}
        : {
            identifiersHash,
            identifierOwnershipApproved: true as const,
          }),
      issuer: 'stub-auth',
      expiresAt: this.now() + 60 * 60 * 1000,
      signature: 'stub-auth-signature',
    };
  }
}

/**
 * In-memory identifier IdP used in tests.
 */
export class StubIdentifierAuthProvider implements RecoveryIdentifierAuthProvider {
  async getKeyBoundIdentifierToken(params: {
    identifier: Identifier;
    proofPublicKey: string;
    requestHash: string;
  }): Promise<KeyBoundIdentifierToken> {
    return {
      identifier: params.identifier,
      proofPublicKey: params.proofPublicKey,
      requestHash: params.requestHash,
      providerAssertion: {
        bound: await hash({
          proofPublicKey: params.proofPublicKey,
          requestHash: params.requestHash,
        }),
      },
    };
  }
}

/**
 * In-memory escrow replica used in tests.
 */
export class StubEscrowProvider implements RecoveryEscrowProvider {
  available = true;

  failNextApplyCount = 0;

  failGetSecret = false;

  invalidReceipts = false;

  now: () => number = () => Date.now();

  readonly #records = new Map<string, RecoveryRecord>();

  readonly #identifierIndex = new Map<string, string>();

  readonly #popChallenges = new Map<string, StoredPoPChallenge>();

  readonly #escrowAuth = new Map<string, StoredEscrowAuth>();

  readonly #grants = new Map<
    string,
    {
      identifier: Identifier;
      requestHash: string;
      expiresAt: number;
      consumed: boolean;
    }
  >();

  readonly id: string;

  constructor(id: string) {
    this.id = id;
  }

  async isAvailable(): Promise<boolean> {
    return this.available;
  }

  async generateChallenge(): Promise<PoPChallenge> {
    const challenge: StoredPoPChallenge = {
      id: `${this.id}-pop-${this.#popChallenges.size + 1}`,
      escrowId: this.id,
      expiresAt: this.now() + CHALLENGE_TTL_MS,
      consumed: false,
    };
    this.#popChallenges.set(challenge.id, challenge);
    return {
      id: challenge.id,
      escrowId: challenge.escrowId,
      expiresAt: challenge.expiresAt,
    };
  }

  async beginIdentifierAuthentication(params: {
    identifier: Identifier;
    requestHash: string;
  }): Promise<EscrowAuthChallenge> {
    if (getIdentifierAuthMode(params.identifier.type) !== 'escrow-challenge') {
      throw new MfaRecoveryError(
        'Identifier type is not escrow-challenge',
        'invalid_auth_mode',
      );
    }
    const challenge: StoredEscrowAuth = {
      id: `${this.id}-otp-${this.#escrowAuth.size + 1}`,
      escrowId: this.id,
      identifier: params.identifier,
      requestHash: params.requestHash,
      expiresAt: this.now() + CHALLENGE_TTL_MS,
      completed: false,
      consumed: false,
    };
    this.#escrowAuth.set(challenge.id, challenge);
    return {
      id: challenge.id,
      escrowId: challenge.escrowId,
      identifier: challenge.identifier,
      requestHash: challenge.requestHash,
      expiresAt: challenge.expiresAt,
    };
  }

  async completeIdentifierAuthentication(
    challengeId: string,
    _response: unknown,
  ): Promise<EscrowIdentifierGrant> {
    const challenge = this.#escrowAuth.get(challengeId);
    if (
      challenge === undefined ||
      challenge.expiresAt <= this.now() ||
      challenge.completed
    ) {
      throw new MfaRecoveryError(
        'Invalid escrow auth challenge',
        'invalid_challenge',
      );
    }
    challenge.completed = true;
    const grant = { id: `${challenge.id}-grant` };
    challenge.grant = grant;
    this.#grants.set(grant.id, {
      identifier: challenge.identifier,
      requestHash: challenge.requestHash,
      expiresAt: challenge.expiresAt,
      consumed: false,
    });
    return grant;
  }

  async getRecoveryMetadata(
    profileId: string,
  ): Promise<RecoveryRecordMetadata | null> {
    const record = this.#records.get(profileId);
    if (record === undefined) {
      return null;
    }
    return { version: record.version, lastMutationId: record.lastMutationId };
  }

  async getSecret(
    authorization: IdentifierAuthorization,
    requestId: string,
  ): Promise<RecoverySecretResponse> {
    if (this.failGetSecret) {
      throw new MfaRecoveryError(
        'Injected getSecret failure',
        'get_secret_failed',
      );
    }
    const requestHash = await hash({
      operation: 'getRecoverySecret',
      requestId,
    });
    const { profileId } = await this.#verifyIdentifierAuthorization(
      authorization,
      requestHash,
    );
    const record = this.#records.get(profileId);
    if (record === undefined) {
      throw new MfaRecoveryError('No recovery record', 'not_registered');
    }
    return {
      recoverySecret: secretHexToBytes(record.recoverySecret),
      version: record.version,
      lastMutationId: record.lastMutationId,
    };
  }

  async applyMutation(
    mutation: Mutation,
    authControllerToken: AuthControllerToken,
    identifierAuthorization: IdentifierAuthorization | null,
    payload: MutationPayload,
  ): Promise<MutationReceipt> {
    if (this.failNextApplyCount > 0) {
      this.failNextApplyCount -= 1;
      throw new MfaRecoveryError('Injected apply failure', 'apply_failed');
    }

    await this.#verifyMutationAuthorization(mutation, authControllerToken);

    const existing = this.#records.get(mutation.profileId)?.appliedMutations[
      mutation.id
    ];
    if (existing) {
      if (
        existing.requestHash !== mutation.requestHash ||
        existing.version !== mutation.newVersion
      ) {
        throw new MfaRecoveryError(
          'Conflicting mutation replay',
          'mutation_conflict',
        );
      }
      return await this.#signReceipt(mutation);
    }

    const record = this.#records.get(mutation.profileId);
    const currentVersion = record?.version ?? 0;
    if (
      mutation.expectedVersion !== currentVersion ||
      mutation.newVersion !== currentVersion + 1
    ) {
      throw new MfaRecoveryError('Version mismatch', 'version_mismatch');
    }

    if (mutation.operation === 'register') {
      if (identifierAuthorization !== null || record !== undefined) {
        throw new MfaRecoveryError('Invalid registration', 'invalid_register');
      }
      const registerPayload = payload as RegisterPayload;
      await this.#assertIdentifierOwnership(
        authControllerToken,
        registerPayload.identifiers,
      );
      this.#assertIdentifiersAvailable(
        mutation.profileId,
        registerPayload.identifiers,
      );
      const next: RecoveryRecord = {
        profileId: mutation.profileId,
        identifiers: registerPayload.identifiers,
        recoverySecret: registerPayload.recoverySecret,
        version: mutation.newVersion,
        lastMutationId: mutation.id,
        appliedMutations: {
          [mutation.id]: {
            requestHash: mutation.requestHash,
            version: mutation.newVersion,
          },
        },
      };
      this.#records.set(mutation.profileId, next);
      this.#replaceIdentifierIndex(
        mutation.profileId,
        [],
        registerPayload.identifiers,
      );
      return await this.#signReceipt(mutation);
    }

    if (record === undefined || authControllerToken.twoFactor !== true) {
      throw new MfaRecoveryError(
        'Update not authorized',
        'update_unauthorized',
      );
    }
    if (identifierAuthorization === null) {
      throw new MfaRecoveryError(
        'Identifier authorization required',
        'missing_identifier_auth',
      );
    }
    const authorization = await this.#verifyIdentifierAuthorization(
      identifierAuthorization,
      mutation.requestHash,
    );
    if (authorization.profileId !== mutation.profileId) {
      throw new MfaRecoveryError('Profile mismatch', 'profile_mismatch');
    }

    if (mutation.operation === 'updateRecoverySecret') {
      record.recoverySecret = (
        payload as UpdateRecoverySecretPayload
      ).recoverySecret;
    } else {
      const { identifiers } = payload as UpdateIdentifiersPayload;
      await this.#assertIdentifierOwnership(authControllerToken, identifiers);
      this.#assertIdentifiersAvailable(mutation.profileId, identifiers);
      this.#replaceIdentifierIndex(
        mutation.profileId,
        record.identifiers,
        identifiers,
      );
      record.identifiers = identifiers;
    }
    record.version = mutation.newVersion;
    record.lastMutationId = mutation.id;
    record.appliedMutations[mutation.id] = {
      requestHash: mutation.requestHash,
      version: mutation.newVersion,
    };
    return await this.#signReceipt(mutation);
  }

  verifyReceipt(receipt: MutationReceipt, mutation: Mutation): boolean {
    if (this.invalidReceipts) {
      return false;
    }
    return (
      receipt.mutationId === mutation.id &&
      receipt.requestHash === mutation.requestHash &&
      receipt.escrowId === this.id &&
      receipt.version === mutation.newVersion
    );
  }

  /**
   * Test helper: remove a replica record.
   *
   * @param profileId - Profile id.
   */
  clearRecord(profileId: string): void {
    this.#records.delete(profileId);
  }

  /**
   * Test helper: force a replica to a specific record version.
   *
   * @param profileId - Profile id.
   * @param patch - Fields to overwrite.
   */
  patchRecord(
    profileId: string,
    patch: Partial<
      Pick<RecoveryRecord, 'version' | 'lastMutationId' | 'recoverySecret'>
    >,
  ): void {
    const record = this.#records.get(profileId);
    if (record === undefined) {
      throw new Error(`No record for ${profileId}`);
    }
    Object.assign(record, patch);
  }

  async #signReceipt(mutation: Mutation): Promise<MutationReceipt> {
    const signature = await hashMutationReceipt({
      escrowId: this.id,
      mutationId: mutation.id,
      requestHash: mutation.requestHash,
      version: mutation.newVersion,
    });
    return {
      mutationId: mutation.id,
      requestHash: mutation.requestHash,
      escrowId: this.id,
      version: mutation.newVersion,
      signature,
    };
  }

  async #verifyMutationAuthorization(
    mutation: Mutation,
    token: AuthControllerToken,
  ): Promise<void> {
    const requestHash = await hash({
      id: mutation.id,
      profileId: mutation.profileId,
      operation: mutation.operation,
      expectedVersion: mutation.expectedVersion,
      newVersion: mutation.newVersion,
      payloadHash: mutation.payloadHash,
      audiences: mutation.audiences,
    });
    if (
      requestHash !== mutation.requestHash ||
      token.requestHash !== mutation.requestHash ||
      token.profileId !== mutation.profileId ||
      token.signature !== 'stub-auth-signature' ||
      token.expiresAt <= this.now() ||
      !mutation.audiences.includes(this.id)
    ) {
      throw new MfaRecoveryError(
        'Invalid mutation authorization',
        'invalid_mutation_auth',
      );
    }
  }

  async #assertIdentifierOwnership(
    token: AuthControllerToken,
    identifiers: Identifier[],
  ): Promise<void> {
    if (
      token.identifierOwnershipApproved !== true ||
      token.identifiersHash !==
        (await hash(canonicalizeIdentifiers(identifiers)))
    ) {
      throw new MfaRecoveryError(
        'Identifier ownership not approved',
        'ownership_not_approved',
      );
    }
    if (identifiers.length === 0) {
      throw new MfaRecoveryError('Empty identifier list', 'empty_identifiers');
    }
  }

  async #verifyIdentifierAuthorization(
    authorization: IdentifierAuthorization,
    requestHash: string,
  ): Promise<{ profileId: string }> {
    let identifier: Identifier;
    if (authorization.kind === 'key-bound') {
      const { token, proof } = authorization;
      identifier = token.identifier;
      if (getIdentifierAuthMode(identifier.type) !== 'key-bound') {
        throw new MfaRecoveryError(
          'Not a key-bound identifier',
          'invalid_auth_mode',
        );
      }
      if (
        token.requestHash !== requestHash ||
        proof.requestHash !== requestHash
      ) {
        throw new MfaRecoveryError(
          'Request hash mismatch',
          'request_hash_mismatch',
        );
      }
      const challenge = this.#popChallenges.get(proof.challengeId);
      if (
        challenge === undefined ||
        challenge.consumed ||
        challenge.escrowId !== this.id ||
        challenge.expiresAt <= this.now()
      ) {
        throw new MfaRecoveryError(
          'Invalid PoP challenge',
          'invalid_challenge',
        );
      }
      const message = await hash([token, proof.challengeId, requestHash]);
      if (
        !(await verifySignature(token.proofPublicKey, proof.signature, message))
      ) {
        throw new MfaRecoveryError('Invalid PoP signature', 'invalid_pop');
      }
      challenge.consumed = true;
    } else {
      const grant = this.#grants.get(authorization.grant.id);
      if (
        grant === undefined ||
        grant.consumed ||
        grant.requestHash !== requestHash ||
        grant.expiresAt <= this.now()
      ) {
        throw new MfaRecoveryError('Invalid escrow grant', 'invalid_grant');
      }
      grant.consumed = true;
      identifier = grant.identifier;
      if (getIdentifierAuthMode(identifier.type) !== 'escrow-challenge') {
        throw new MfaRecoveryError(
          'Not an escrow-challenge identifier',
          'invalid_auth_mode',
        );
      }
    }

    const profileId = this.#identifierIndex.get(
      canonicalIdentifier(identifier),
    );
    if (profileId === undefined) {
      throw new MfaRecoveryError('Unknown identifier', 'unknown_identifier');
    }
    return { profileId };
  }

  #assertIdentifiersAvailable(
    profileId: string,
    identifiers: Identifier[],
  ): void {
    for (const identifier of identifiers) {
      const owner = this.#identifierIndex.get(canonicalIdentifier(identifier));
      if (owner !== undefined && owner !== profileId) {
        throw new MfaRecoveryError(
          'Identifier owned by another profile',
          'identifier_taken',
        );
      }
    }
  }

  #replaceIdentifierIndex(
    profileId: string,
    previous: Identifier[],
    next: Identifier[],
  ): void {
    for (const identifier of previous) {
      this.#identifierIndex.delete(canonicalIdentifier(identifier));
    }
    for (const identifier of next) {
      this.#identifierIndex.set(canonicalIdentifier(identifier), profileId);
    }
  }
}

/**
 * JSON round-trip encryptor for tests. Production uses wallet secure storage.
 */
export const passthroughEncryptor: PendingOperationEncryptor = {
  async encrypt(operation: PendingOperation): Promise<string> {
    return JSON.stringify(operation);
  },
  async decrypt(ciphertext: string): Promise<PendingOperation> {
    return JSON.parse(ciphertext) as PendingOperation;
  },
};

/**
 * @param identifier - Identifier to canonicalize.
 * @returns Index key.
 */
function canonicalIdentifier(identifier: Identifier): string {
  return `${identifier.type}:${identifier.namespace}:${identifier.value}`;
}
