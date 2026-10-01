import type {
  C2FResponse,
  CubeSignerClient,
  JsonValue,
  Version,
} from '@cubist-labs/cubesigner-sdk';

import {
  hashMutationReceipt,
  verifySignature,
  wrapKeyId,
} from '../crypto.js';
import { MfaRecoveryError } from '../errors.js';
import { isMutationReceipt } from '../escrow-utils.js';
import type {
  AuthControllerToken,
  EcPublicJwk,
  GetRecoverySecretResponse,
  IdentifierAuthorization,
  Mutation,
  MutationPayload,
  MutationReceipt,
  PoPChallenge,
  RecoveryEscrowProvider,
} from '../types.js';

const ESCROW_ID = 'cubist';
const DEFAULT_FUNCTION_ID = 'cubist_secret_escrow';
const DEFAULT_VERSION: Version = 'latest';

/**
 * CubeSigner C2F client for the Cubist recovery escrow.
 *
 * Commands are invoked as `{ cmd, ...fields }` on `cubist_secret_escrow`.
 * Escrow JSON is read from C2F stdout. Receipt signatures are checked locally
 * with the pinned receipt public key.
 */
export type CubistEscrowProviderOptions = {
  /**
   * Authenticated CubeSigner client used to load and invoke the escrow C2F.
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
   * P-256 public JWK JSON for the escrow wrap key.
   */
  wrapPublicKey: string;
  /**
   * P-256 public JWK JSON for the escrow receipt key.
   */
  receiptPublicKey: string;
};

export class CubistEscrowProvider implements RecoveryEscrowProvider {
  readonly id = ESCROW_ID;

  readonly wrapPublicKey: string;

  readonly #receiptPublicKey: string;

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
   * @returns Whether the escrow C2F can be loaded.
   */
  async isAvailable(): Promise<boolean> {
    try {
      await this.#client.org().getFunction(this.#functionId);
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
    pkE: EcPublicJwk,
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
  verifyReceipt(
    receipt: MutationReceipt,
    mutation: Mutation,
    expectedEscrowId: string,
  ): boolean {
    if (
      receipt.mutationId !== mutation.id ||
      receipt.requestHash !== mutation.requestHash ||
      receipt.escrowId !== expectedEscrowId ||
      expectedEscrowId !== this.id ||
      receipt.version !== mutation.newVersion ||
      receipt.receiptKeyId !== wrapKeyId(this.#receiptPublicKey)
    ) {
      return false;
    }
    return verifySignature(
      this.#receiptPublicKey,
      receipt.signature,
      hashMutationReceipt({
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
  ): Promise<Result> {
    let policy: C2FResponse;
    let stdoutBytes: Uint8Array;
    try {
      const fn = await this.#client.org().getFunction(this.#functionId);
      const result = await fn.invoke(undefined, this.#version, {
        cmd,
        ...body,
      } as JsonValue);
      policy = result.response;
      stdoutBytes = result.stdoutBytes;
    } catch (error) {
      throw new MfaRecoveryError(
        error instanceof Error ? error.message : 'Escrow request failed',
        'escrow_request_failed',
      );
    }
    if (policy.response !== 'Allow') {
      throw new MfaRecoveryError(
        policy.response === 'Deny' ? policy.reason : policy.error,
        'escrow_request_failed',
      );
    }
    let json: unknown;
    try {
      json = JSON.parse(new TextDecoder().decode(stdoutBytes));
    } catch {
      throw new MfaRecoveryError(
        'Escrow response was not JSON',
        'escrow_response_invalid',
      );
    }
    return parse(json);
  }
}

function parseChallenge(value: unknown): PoPChallenge {
  if (
    !isRecord(value) ||
    typeof value.id !== 'string' ||
    value.escrowId !== ESCROW_ID ||
    typeof value.expiresAt !== 'number' ||
    !Number.isInteger(value.expiresAt)
  ) {
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

function parseGetSecretResponse(value: unknown): GetRecoverySecretResponse {
  if (
    !isRecord(value) ||
    !isRecord(value.recoverySecret) ||
    typeof value.recoverySecret.ciphertext !== 'string' ||
    typeof value.version !== 'number' ||
    !Number.isInteger(value.version) ||
    value.version < 0 ||
    typeof value.lastMutationId !== 'string' ||
    typeof value.wrapKeyId !== 'string'
  ) {
    throw new MfaRecoveryError(
      'Invalid recovery secret response',
      'escrow_response_invalid',
    );
  }
  return {
    recoverySecret: { ciphertext: value.recoverySecret.ciphertext },
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
