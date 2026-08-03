import { bytesToHex, hexToBytes } from '@metamask/utils';

import {
  SecretEscrowError,
  SecretEscrowErrorCode,
} from './errors.js';
import type {
  AddFactorParams,
  EscrowAssertion,
  EscrowEnrollmentMetadata,
  EscrowWrappedPassword,
  ExportCompleteParams,
  ExportCompleteResult,
  ExportInitParams,
  ExportInitResult,
  RegisterParams,
  RegisterResult,
  RevokeParams,
  SecretEscrowClient,
} from './types.js';

export type HttpSecretEscrowClientOptions = {
  /** Base URL of the mock/real escrow HTTP API (no trailing slash). */
  baseUrl: string;
  /**
   * Optional fetch implementation (defaults to `globalThis.fetch`).
   */
  fetch?: typeof globalThis.fetch;
};

type ErrorBody = {
  code?: string;
  message?: string;
};

/**
 * HTTP {@link SecretEscrowClient} for the local mock escrow server (and a
 * future real escrow API with the same routes).
 *
 * Secrets are transferred as hex over the wire.
 */
export class HttpSecretEscrowClient implements SecretEscrowClient {
  readonly #baseUrl: string;

  readonly #fetch: typeof globalThis.fetch;

  constructor(options: HttpSecretEscrowClientOptions) {
    this.#baseUrl = options.baseUrl.replace(/\/$/u, '');
    this.#fetch = options.fetch ?? globalThis.fetch.bind(globalThis);
  }

  async register(params: RegisterParams): Promise<RegisterResult> {
    const body: Record<string, unknown> = {
      userId: params.userId,
      factorId: params.factorId,
      factor: params.factor,
    };
    if (params.secret !== undefined) {
      body.secretHex = bytesToHex(params.secret);
    }
    const result = await this.#request<{ secretHex: string }>('/v1/register', {
      method: 'POST',
      body,
    });
    return { secret: hexToBytes(result.secretHex) };
  }

  async addFactor(params: AddFactorParams): Promise<void> {
    await this.#request<void>('/v1/add_factor', {
      method: 'POST',
      body: params,
    });
  }

  async exportInit(params: ExportInitParams): Promise<ExportInitResult> {
    return this.#request<ExportInitResult>('/v1/export_init', {
      method: 'POST',
      body: params,
    });
  }

  async exportComplete(
    params: ExportCompleteParams,
  ): Promise<ExportCompleteResult> {
    const result = await this.#request<{ secretHex: string }>(
      '/v1/export_complete',
      {
        method: 'POST',
        body: params,
      },
    );
    return { secret: hexToBytes(result.secretHex) };
  }

  async revoke(params: RevokeParams): Promise<void> {
    await this.#request<void>('/v1/revoke', {
      method: 'POST',
      body: params,
    });
  }

  /**
   * Optional health check (supported by the local mock server).
   *
   * @returns Health payload when the server is reachable.
   */
  async health(): Promise<{ ok: boolean }> {
    return this.#request<{ ok: boolean }>('/health', { method: 'GET' });
  }

  /**
   * Persists factor metadata + wrapped password (no escrow secret).
   *
   * Used so wipe/rehydrate can restore local enrollment without TOPRF password.
   *
   * @param metadata - Public enrollment metadata.
   */
  async putEnrollmentMetadata(
    metadata: EscrowEnrollmentMetadata,
  ): Promise<void> {
    await this.#request<void>(
      `/v1/users/${encodeURIComponent(metadata.userId)}/enrollment`,
      {
        method: 'PUT',
        body: metadata,
      },
    );
  }

  /**
   * Loads public enrollment metadata for a user, if present.
   *
   * @param userId - Escrow user id.
   * @returns Enrollment metadata or null when not found.
   */
  async getEnrollmentMetadata(
    userId: string,
  ): Promise<EscrowEnrollmentMetadata | null> {
    const response = await this.#fetch(
      `${this.#baseUrl}/v1/users/${encodeURIComponent(userId)}/enrollment`,
      {
        method: 'GET',
        headers: { Accept: 'application/json' },
      },
    );
    if (response.status === 404) {
      return null;
    }
    if (!response.ok) {
      await this.#throwFromResponse(response);
    }
    return (await response.json()) as EscrowEnrollmentMetadata;
  }

  async #request<T>(
    path: string,
    options: { method: string; body?: unknown },
  ): Promise<T> {
    const response = await this.#fetch(`${this.#baseUrl}${path}`, {
      method: options.method,
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body:
        options.body === undefined ? undefined : JSON.stringify(options.body),
    });
    if (!response.ok) {
      await this.#throwFromResponse(response);
    }
    if (response.status === 204) {
      return undefined as T;
    }
    const text = await response.text();
    if (!text) {
      return undefined as T;
    }
    return JSON.parse(text) as T;
  }

  async #throwFromResponse(response: Response): Promise<never> {
    let body: ErrorBody = {};
    try {
      body = (await response.json()) as ErrorBody;
    } catch {
      // ignore
    }
    const code = mapHttpErrorCode(body.code);
    throw new SecretEscrowError(
      body.message ?? `Secret escrow HTTP ${response.status}`,
      { code },
    );
  }
}

/**
 * Maps a server error code string to {@link SecretEscrowErrorCode}.
 *
 * @param code - Optional code from the HTTP body.
 * @returns Known error code or AssertionFailed as a generic fallback.
 */
function mapHttpErrorCode(code: string | undefined): SecretEscrowErrorCode {
  if (
    code &&
    Object.values(SecretEscrowErrorCode).includes(code as SecretEscrowErrorCode)
  ) {
    return code as SecretEscrowErrorCode;
  }
  return SecretEscrowErrorCode.AssertionFailed;
}

export type { EscrowAssertion, EscrowWrappedPassword };
