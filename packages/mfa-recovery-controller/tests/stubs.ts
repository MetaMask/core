import type { KeyPair } from '@metamask/cryptography';
import {
  bytesToBase64,
  bytesToHex,
  hexToBytes,
  stringToBytes,
} from '@metamask/utils';

import { decodeAuthControllerToken } from '../src/auth-controller-token.js';
import {
  canonicalizeIdentifiers,
  decryptFromPublic,
  encryptToPublic,
  hash,
  hashMutationReceipt,
  receiptKeyId,
  sign,
  unixNow,
  verifySignature,
  wrapKeyId,
} from '../src/crypto.js';
import { MfaRecoveryError, MutationRejectedError } from '../src/errors.js';
import {
  MIN_IDENTIFIERS,
  getIdentifierAuthMode,
} from '../src/identifier-auth.js';
import type {
  AuthControllerToken,
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
  GetRecoverySecretResponse,
  RegisterPayload,
  UpdateIdentifiersPayload,
  UpdateRecoverySecretPayload,
  WrappedSecret,
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

const CHALLENGE_TTL_SECS = 5 * 60;

/**
 * Builds an unsigned compact JWT carrying the claims the controller reads from
 * an AuthController (Hydra) access token.
 *
 * @param claims - Token claims.
 * @param claims.sub - The profile id.
 * @param claims.exp - Unix time in seconds.
 * @param claims.requestHash - Hash of the request the token is bound to.
 * @param claims.aal - Authentication assurance level.
 * @param claims.identifiersHash - Hash of the approved identifier set.
 * @returns The compact JWT.
 */
export function createAuthControllerToken({
  sub,
  exp,
  requestHash,
  aal,
  identifiersHash,
}: {
  sub: string;
  exp: number;
  requestHash: string;
  aal?: number;
  identifiersHash?: string;
}): AuthControllerToken {
  const encode = (value: unknown): string =>
    bytesToBase64(stringToBytes(JSON.stringify(value)))
      .replace(/\+/gu, '-')
      .replace(/\//gu, '_')
      .replace(/[=]+$/u, '');
  const payload = {
    sub,
    exp,
    ext: { aal, request_hash: requestHash, identifiers_hash: identifiersHash },
  };
  return `${encode({ alg: 'none' })}.${encode(payload)}.stub-signature`;
}

/**
 * In-memory AuthController used in tests.
 */
export class StubAuthProvider implements RecoveryAuthProvider {
  profileId = 'profile-1';

  now: () => number = unixNow;

  async getAuthenticatedProfileId(): Promise<string> {
    return this.profileId;
  }

  async authorizeRecoveryRequest(params: {
    requestHash: string;
    requireTwoFactor?: boolean;
    identifiers?: Identifier[];
  }): Promise<AuthControllerToken> {
    return createAuthControllerToken({
      sub: this.profileId,
      exp: this.now() + 60 * 60,
      requestHash: params.requestHash,
      aal: params.requireTwoFactor ? 2 : 1,
      ...(params.identifiers === undefined
        ? {}
        : {
            identifiersHash: await hash(
              canonicalizeIdentifiers(params.identifiers),
            ),
          }),
    });
  }
}

/**
 * In-memory identifier IdP used in tests.
 */
export class StubIdentifierAuthProvider implements RecoveryIdentifierAuthProvider {
  async getKeyBoundIdentifierToken(params: {
    identifier: Identifier;
    proofPublicKey: Uint8Array;
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

  now: () => number = unixNow;

  readonly #records = new Map<string, RecoveryRecord>();

  readonly #identifierIndex = new Map<string, string>();

  readonly #popChallenges = new Map<string, StoredPoPChallenge>();

  readonly id: string;

  readonly authAudience = 'stub-audience';

  readonly wrapPublicKey: Uint8Array;

  /**
   * Raw 32-byte Ed25519 receipt public key. Distinct from {@link wrapPublicKey},
   * matching cubist WRAP_KEY vs RECEIPT_KEY.
   */
  readonly receiptPublicKey: Uint8Array;

  readonly #wrapPrivateKey: Uint8Array;

  readonly #receiptPrivateKey: Uint8Array;

  readonly #replicaIds: string[];

  #applyCommitted = false;

  constructor(
    id: string,
    wrapKey: KeyPair,
    receiptKey: KeyPair,
    replicaIds: string[] = [id],
  ) {
    this.id = id;
    this.wrapPublicKey = wrapKey.publicKey;
    this.#wrapPrivateKey = wrapKey.privateKey;
    this.receiptPublicKey = receiptKey.publicKey;
    this.#receiptPrivateKey = receiptKey.privateKey;
    this.#replicaIds = [...replicaIds];
  }

  async isAvailable(): Promise<boolean> {
    return this.available;
  }

  async generateChallenge(): Promise<PoPChallenge> {
    const challenge: StoredPoPChallenge = {
      id: `${this.id}-pop-${this.#popChallenges.size + 1}`,
      escrowId: this.id,
      expiresAt: this.now() + CHALLENGE_TTL_SECS,
      consumed: false,
    };
    this.#popChallenges.set(challenge.id, challenge);
    return {
      id: challenge.id,
      escrowId: challenge.escrowId,
      expiresAt: challenge.expiresAt,
    };
  }

  /**
   * Test helper: inspect a replica's version without going through getSecret.
   *
   * @param profileId - Profile id.
   * @returns Version metadata, or `null` if unregistered.
   */
  async getRecoveryMetadata(
    profileId: string,
  ): Promise<{ version: number; lastMutationId: string } | null> {
    const record = this.#records.get(profileId);
    if (record === undefined) {
      return null;
    }
    return { version: record.version, lastMutationId: record.lastMutationId };
  }

  async getSecret(
    authorization: IdentifierAuthorization,
    requestId: string,
    pkE: Uint8Array,
  ): Promise<GetRecoverySecretResponse> {
    if (this.failGetSecret) {
      throw new MfaRecoveryError(
        'Injected getSecret failure',
        'get_secret_failed',
      );
    }
    const requestHash = await hash({
      operation: 'getRecoverySecret',
      requestId,
      pkE,
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
      recoverySecret: {
        ciphertext: await encryptToPublic(
          this.#wrapPrivateKey,
          pkE,
          hexToBytes(record.recoverySecret),
        ),
      },
      version: record.version,
      lastMutationId: record.lastMutationId,
      wrapKeyId: await wrapKeyId(this.wrapPublicKey),
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

    this.#applyCommitted = false;
    try {
      return await this.#applyMutation(
        mutation,
        authControllerToken,
        identifierAuthorization,
        payload,
      );
    } catch (error) {
      if (!this.#applyCommitted && error instanceof MfaRecoveryError) {
        throw new MutationRejectedError(error.message);
      }
      throw error;
    }
  }

  async #applyMutation(
    mutation: Mutation,
    authControllerToken: AuthControllerToken,
    identifierAuthorization: IdentifierAuthorization | null,
    payload: MutationPayload,
  ): Promise<MutationReceipt> {
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
      const recoverySecret = await this.#unwrapPayloadSecret(
        registerPayload.recoverySecret,
      );
      await this.#assertPayloadHash(mutation, {
        identifiers: registerPayload.identifiers,
        recoverySecret,
      });
      await this.#assertIdentifierOwnership(
        authControllerToken,
        registerPayload.identifiers,
      );
      this.#assertIdentifiersAvailable(
        mutation.profileId,
        registerPayload.identifiers,
      );
      this.#applyCommitted = true;
      const next: RecoveryRecord = {
        profileId: mutation.profileId,
        identifiers: registerPayload.identifiers,
        recoverySecret,
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

    const claims = decodeAuthControllerToken(authControllerToken);
    if (record === undefined || (claims?.ext.aal ?? 0) < 2) {
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
      const recoverySecret = await this.#unwrapPayloadSecret(
        (payload as UpdateRecoverySecretPayload).recoverySecret,
      );
      await this.#assertPayloadHash(mutation, {
        recoverySecret,
      });
      this.#applyCommitted = true;
      record.recoverySecret = recoverySecret;
    } else {
      const { identifiers } = payload as UpdateIdentifiersPayload;
      await this.#assertPayloadHash(mutation, payload);
      await this.#assertIdentifierOwnership(authControllerToken, identifiers);
      this.#assertIdentifiersAvailable(mutation.profileId, identifiers);
      this.#applyCommitted = true;
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

  async verifyReceipt(
    receipt: MutationReceipt,
    mutation: Mutation,
    expectedEscrowId: string,
  ): Promise<boolean> {
    if (this.invalidReceipts) {
      return false;
    }
    if (
      receipt.mutationId !== mutation.id ||
      receipt.requestHash !== mutation.requestHash ||
      receipt.escrowId !== expectedEscrowId ||
      expectedEscrowId !== this.id ||
      receipt.version !== mutation.newVersion ||
      receipt.receiptKeyId !== (await receiptKeyId(this.receiptPublicKey))
    ) {
      return false;
    }
    return await verifySignature(
      this.receiptPublicKey,
      receipt.signature,
      await hashMutationReceipt({
        escrowId: receipt.escrowId,
        mutationId: receipt.mutationId,
        receiptKeyId: receipt.receiptKeyId,
        requestHash: receipt.requestHash,
        version: receipt.version,
      }),
    );
  }

  /**
   * Test helper: sign a mutation receipt with this replica's receipt key.
   *
   * @param mutation - Mutation the receipt acknowledges.
   * @returns Signed receipt.
   */
  async createReceipt(mutation: Mutation): Promise<MutationReceipt> {
    return await this.#signReceipt(mutation);
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
    const unsigned = {
      mutationId: mutation.id,
      requestHash: mutation.requestHash,
      escrowId: this.id,
      version: mutation.newVersion,
      receiptKeyId: await receiptKeyId(this.receiptPublicKey),
    };
    return {
      ...unsigned,
      signature: await sign(
        this.#receiptPrivateKey,
        await hashMutationReceipt(unsigned),
      ),
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
    const claims = decodeAuthControllerToken(token);
    if (
      requestHash !== mutation.requestHash ||
      claims?.ext.requestHash !== mutation.requestHash ||
      claims.sub !== mutation.profileId ||
      claims.exp <= this.now() ||
      !this.#hasExactAudiences(mutation.audiences)
    ) {
      throw new MfaRecoveryError(
        'Invalid mutation authorization',
        'invalid_mutation_auth',
      );
    }
  }

  #hasExactAudiences(audiences: string[]): boolean {
    return (
      audiences.length === this.#replicaIds.length &&
      audiences.every((id, index) => id === this.#replicaIds[index])
    );
  }

  async #assertIdentifierOwnership(
    token: AuthControllerToken,
    identifiers: Identifier[],
  ): Promise<void> {
    if (
      decodeAuthControllerToken(token)?.ext.identifiersHash !==
      (await hash(canonicalizeIdentifiers(identifiers)))
    ) {
      throw new MfaRecoveryError(
        'Identifier ownership not approved',
        'ownership_not_approved',
      );
    }
    if (identifiers.length < MIN_IDENTIFIERS) {
      throw new MfaRecoveryError('Empty identifier list', 'empty_identifiers');
    }
  }

  async #verifyIdentifierAuthorization(
    authorization: IdentifierAuthorization,
    requestHash: string,
  ): Promise<{ profileId: string }> {
    const { token, proof } = authorization;
    const { identifier } = token;
    getIdentifierAuthMode(identifier.type);
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
      throw new MfaRecoveryError('Invalid PoP challenge', 'invalid_challenge');
    }
    const message = await hash([token, proof.challengeId, requestHash]);
    if (
      !(await verifySignature(token.proofPublicKey, proof.signature, message))
    ) {
      throw new MfaRecoveryError('Invalid PoP signature', 'invalid_pop');
    }
    challenge.consumed = true;

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

  async #assertPayloadHash(
    mutation: Mutation,
    payload: unknown,
  ): Promise<void> {
    if ((await hash(payload)) !== mutation.payloadHash) {
      throw new MfaRecoveryError(
        'Mutation payload does not match payloadHash',
        'payload_mismatch',
      );
    }
  }

  async #unwrapPayloadSecret(wrapped: WrappedSecret): Promise<string> {
    return bytesToHex(
      await decryptFromPublic(
        this.#wrapPrivateKey,
        wrapped.pkE,
        wrapped.ciphertext,
      ),
    );
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
