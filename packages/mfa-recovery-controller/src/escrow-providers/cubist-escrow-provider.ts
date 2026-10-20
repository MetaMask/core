import type {
  CubeSignerClient,
  InvokePolicyResponse,
  Version,
} from '@cubist-labs/cubesigner-sdk';
import { integer, is, literal, min, string, type } from '@metamask/superstruct';
import {
  bytesToHex,
  bytesToString,
  hexToBytes,
  isStrictHexString,
} from '@metamask/utils';

import {
  hashMutationReceipt,
  receiptKeyId,
  verifySignature,
} from '../crypto.js';
import { MfaRecoveryError, MutationRejectedError } from '../errors.js';
import { isMutationReceipt } from '../escrow-utils.js';
import type {
  AuthControllerToken,
  GetRecoverySecretResponse,
  IdentifierAuthorization,
  Mutation,
  MutationPayload,
  MutationReceipt,
  PoPChallenge,
  RecoveryEscrowProvider,
} from '../types.js';

const ESCROW_ID = 'cubist';
const AUTH_AUDIENCE = 'cubist';
const DEFAULT_FUNCTION_ID = 'cubist_secret_escrow';
const DEFAULT_VERSION: Version = 'latest';

/**
 * CubeSigner C2F client for the Cubist recovery escrow.
 *
 * Commands are sent with `policyInvoke` as `{ cmd, ...fields }` on
 * `cubist_secret_escrow`.
 * Escrow JSON is read from C2F stdout. Receipt signatures are checked locally
 * with the pinned receipt public key.
 */
export type CubistEscrowProviderOptions = {
  /**
   * Authenticated CubeSigner client used to invoke the escrow C2F.
   */
  client: CubeSignerClient;
  /**
   * C2F name or named-policy id. Defaults to `cubist_secret_escrow`.
   */
  functionId?: string;
  /**
   * C2F version to invoke. Defaults to `latest`.
   */
  version?: Version;
  /**
   * Raw 32-byte X25519 public key of the escrow wrap key.
   */
  wrapPublicKey: Uint8Array;
  /**
   * Raw 32-byte Ed25519 public key of the escrow receipt key.
   */
  receiptPublicKey: Uint8Array;
};

export class CubistEscrowProvider implements RecoveryEscrowProvider {
  readonly id = ESCROW_ID;

  readonly authAudience = AUTH_AUDIENCE;

  readonly wrapPublicKey: Uint8Array;

  readonly #receiptPublicKey: Uint8Array;

  readonly #client: CubeSignerClient;

  readonly #functionId: string;

  readonly #version: Version;

  /**
   * @param options - CubeSigner client, pinned keys, and optional C2F id/version.
   */
  constructor(options: CubistEscrowProviderOptions) {
    this.wrapPublicKey = options.wrapPublicKey;
    this.#receiptPublicKey = options.receiptPublicKey;
    this.#client = options.client;
    this.#functionId = options.functionId ?? DEFAULT_FUNCTION_ID;
    this.#version = options.version ?? DEFAULT_VERSION;
  }

  /**
   * @returns Whether a ping of the escrow C2F is allowed and reports ok.
   */
  async isAvailable(): Promise<boolean> {
    try {
      await this.#invoke('ping', {}, parsePing);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * @returns A proof-of-possession challenge for this escrow.
   */
  async generateChallenge(): Promise<PoPChallenge> {
    return await this.#invoke('generateChallenge', {}, parseChallenge);
  }

  /**
   * @param authorization - Identifier proof for this read.
   * @param requestId - Client request id bound into the read hash.
   * @param pkE - Ephemeral wrap public key for the response.
   * @returns The wrapped recovery secret and its version.
   */
  async getSecret(
    authorization: IdentifierAuthorization,
    requestId: string,
    pkE: Uint8Array,
  ): Promise<GetRecoverySecretResponse> {
    return await this.#invoke(
      'getSecret',
      {
        identifierAuthorization: authorization,
        requestId,
        pkE,
      },
      parseGetSecretResponse,
    );
  }

  /**
   * @param mutation - Mutation to apply.
   * @param authControllerToken - Request-bound AuthController token.
   * @param identifierAuthorization - Identifier proof. `null` for register.
   * @param payload - Per-escrow mutation payload.
   * @returns The escrow's mutation receipt.
   */
  async applyMutation(
    mutation: Mutation,
    authControllerToken: AuthControllerToken,
    identifierAuthorization: IdentifierAuthorization | null,
    payload: MutationPayload,
  ): Promise<MutationReceipt> {
    return await this.#invoke(
      'applyMutation',
      {
        mutation,
        authControllerToken,
        identifierAuthorization,
        payload,
      },
      parseReceipt,
      true, // a policy Deny did not apply the mutation
    );
  }

  /**
   * Verifies a receipt with the pinned receipt public key.
   *
   * @param receipt - Receipt returned by the escrow.
   * @param mutation - Mutation the receipt must acknowledge.
   * @param expectedEscrowId - Escrow identity expected by the caller.
   * @returns Whether the receipt is valid for this escrow.
   */
  async verifyReceipt(
    receipt: MutationReceipt,
    mutation: Mutation,
    expectedEscrowId: string,
  ): Promise<boolean> {
    if (
      receipt.mutationId !== mutation.id ||
      receipt.requestHash !== mutation.requestHash ||
      receipt.escrowId !== expectedEscrowId ||
      expectedEscrowId !== this.id ||
      receipt.version !== mutation.newVersion ||
      receipt.receiptKeyId !== (await receiptKeyId(this.#receiptPublicKey))
    ) {
      return false;
    }
    return await verifySignature(
      this.#receiptPublicKey,
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

  async #invoke<Result>(
    cmd: string,
    body: Record<string, unknown>,
    parse: (value: unknown) => Result,
    denyIsRejection = false,
  ): Promise<Result> {
    let invocation: InvokePolicyResponse;
    try {
      invocation = await this.#client.apiClient.policyInvoke(
        this.#functionId,
        this.#version,
        { request: toWire({ cmd, ...body }) },
      );
    } catch (error) {
      throw new MfaRecoveryError(
        error instanceof Error ? error.message : 'Escrow request failed',
        'escrow_request_failed',
      );
    }
    const policy = invocation.response;
    if (policy.response !== 'Allow') {
      if (denyIsRejection && policy.response === 'Deny') {
        throw new MutationRejectedError(policy.reason);
      }
      throw new MfaRecoveryError(
        policy.response === 'Deny' ? policy.reason : policy.error,
        'escrow_request_failed',
      );
    }
    let json: unknown;
    try {
      json = JSON.parse(bytesToString(hexToBytes(invocation.stdout)));
    } catch {
      throw new MfaRecoveryError(
        'Escrow response was not JSON',
        'escrow_response_invalid',
      );
    }
    return parse(json);
  }
}

// `type()` is non-strict, so unknown fields are ignored. The explicit field
// mapping below still strips them from the returned value.
const PingStruct = type({ ok: literal(true) });

const ChallengeStruct = type({
  id: string(),
  escrowId: literal(ESCROW_ID),
  expiresAt: integer(),
});

const GetSecretResponseStruct = type({
  recoverySecret: type({ ciphertext: string() }),
  version: min(integer(), 0),
  lastMutationId: string(),
  wrapKeyId: string(),
});

function parsePing(value: unknown): void {
  if (!is(value, PingStruct)) {
    throw new MfaRecoveryError(
      'Invalid ping response',
      'escrow_response_invalid',
    );
  }
}

function parseChallenge(value: unknown): PoPChallenge {
  if (!is(value, ChallengeStruct)) {
    throw new MfaRecoveryError(
      'Invalid PoP challenge',
      'escrow_response_invalid',
    );
  }
  return {
    id: value.id,
    escrowId: value.escrowId,
    expiresAt: value.expiresAt,
  };
}

/**
 * Encodes a request for the escrow wire: every byte field becomes a 0x-prefixed
 * hex string. Typed arrays have no `toJSON`, so the replacer sees them directly.
 *
 * @param value - Request body.
 * @returns JSON-compatible request body.
 */
function toWire(value: Record<string, unknown>): Record<string, unknown> {
  return JSON.parse(
    JSON.stringify(value, (_key, node: unknown) =>
      node instanceof Uint8Array ? bytesToHex(node) : node,
    ),
  ) as Record<string, unknown>;
}

function parseGetSecretResponse(value: unknown): GetRecoverySecretResponse {
  if (
    !is(value, GetSecretResponseStruct) ||
    !isStrictHexString(value.recoverySecret.ciphertext)
  ) {
    throw new MfaRecoveryError(
      'Invalid recovery secret response',
      'escrow_response_invalid',
    );
  }
  return {
    recoverySecret: {
      ciphertext: hexToBytes(value.recoverySecret.ciphertext),
    },
    version: value.version,
    lastMutationId: value.lastMutationId,
    wrapKeyId: value.wrapKeyId,
  };
}

function parseReceipt(value: unknown): MutationReceipt {
  if (!isMutationReceipt(value)) {
    throw new MfaRecoveryError(
      'Invalid mutation receipt',
      'escrow_response_invalid',
    );
  }
  return value;
}
