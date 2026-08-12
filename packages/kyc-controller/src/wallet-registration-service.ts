/** The only blockchain supported by the Money Account POC. */
export type Blockchain = 'Monad';

/** Normalized view of a single registered self-hosted address. */
export type SelfHostedRegistration = {
  id: string;
  address: string;
  blockchain: Blockchain;
  disabled: boolean;
  isSelf: boolean;
};

/** Result of reconciling a wallet against the customer's registered addresses. */
export type RegistrationStatus =
  | { type: 'active'; registration: SelfHostedRegistration }
  | { type: 'disabled'; registration: SelfHostedRegistration }
  | { type: 'absent' };

/**
 * Discriminated error kinds surfaced to the state machine. Every non-success
 * path maps to exactly one of these so the machine can decide deterministically.
 */
export type WalletRegistrationErrorKind =
  | 'validation'
  | 'unauthorized'
  | 'forbidden'
  | 'notFound'
  | 'conflict'
  | 'rateLimited'
  | 'transient'
  | 'lookupUnavailable'
  | 'malformedResponse';

/** Minimal HTTP response shape, so the service is environment-agnostic. */
type HttpResponse = {
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
  text: () => Promise<string>;
};

/** Minimal `fetch`-like function the service depends on. */
type FetchLike = (
  url: string,
  init?: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
  },
) => Promise<HttpResponse>;

/** Typed error carrying enough context for state transitions. */
export class WalletRegistrationError extends Error {
  readonly kind: WalletRegistrationErrorKind;

  readonly httpStatus?: number;

  readonly body?: string;

  constructor(
    kind: WalletRegistrationErrorKind,
    options: {
      message?: string;
      httpStatus?: number;
      body?: string;
    },
  ) {
    super(options.message ?? `wallet registration failed: ${kind}`);
    this.name = 'WalletRegistrationError';
    this.kind = kind;
    this.httpStatus = options.httpStatus;
    this.body = options.body;
  }
}

export type WalletRegistrationServiceOptions = {
  fetch: FetchLike;
  /**
   * Base URL of the Money Movement neobank-proxy host
   * (e.g. `https://on-ramp.dev-api.cx.metamask.io`). Paths are under `/neobank`.
   */
  baseUrl: string;
  getAuthToken: () => Promise<string>;
  /**
   * MetaMask profile / partner external id used as MoonPay `external_id`
   * (typically `AuthenticationController:getSessionProfile().canonicalProfileId`).
   */
  getExternalId: () => Promise<string>;
};

export type GetRegistrationStatusRequest = {
  customerId: string;
  address: string;
  blockchain: Blockchain;
};

export type RegisterSelfHostedWalletRequest = {
  customerId: string;
  address: string;
  blockchain: Blockchain;
  message: string;
  signature: string;
  /**
   * Stable key reused across retries of the same ownership proof. Generated
   * when omitted.
   */
  idempotencyKey?: string;
};

/** Successful registration outcome. */
export type RegistrationOutcome = {
  type: 'registered';
  registration: SelfHostedRegistration;
};

/**
 * Normalizes a Monad EVM address for case-insensitive comparison.
 *
 * @param address - Raw address string.
 * @returns The comparison key for the address.
 */
function normalizeAddress(address: string): string {
  return address.toLowerCase();
}

/**
 * Maps an HTTP status to the typed error kind the state machine reacts to.
 *
 * @param status - HTTP status code from the proxy/Iron response.
 * @returns The corresponding error kind.
 */
function mapStatusToKind(status: number): WalletRegistrationErrorKind {
  switch (status) {
    case 400:
      return 'validation';
    case 401:
      return 'unauthorized';
    case 403:
      return 'forbidden';
    case 404:
      return 'notFound';
    case 409:
      return 'conflict';
    case 429:
      return 'rateLimited';
    default:
      return status >= 500 ? 'transient' : 'validation';
  }
}

/**
 * Builds a client-side Idempotency-Key for MoonPay POSTs. Prefer a stable
 * caller-supplied key across retries of the same proof.
 *
 * @returns A random UUID when available, otherwise a timestamped fallback.
 */
export function createIdempotencyKey(): string {
  const cryptoObj = globalThis.crypto as
    | { randomUUID?: () => string }
    | undefined;
  if (typeof cryptoObj?.randomUUID === 'function') {
    return cryptoObj.randomUUID();
  }
  return `wallet-reg-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

/**
 * Extracts a human-readable error body from a transparent neobank-proxy
 * response. Upstream may return a plain string or a JSON value; both are
 * mirrored 1:1 (no `{ code: 'iron_error' }` envelope).
 *
 * @param raw - Raw response text.
 * @returns Normalized body string for {@link WalletRegistrationError}.
 */
export function extractErrorBody(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) {
    return raw;
  }
  try {
    const parsed: unknown = JSON.parse(trimmed);
    if (typeof parsed === 'string') {
      return parsed;
    }
    if (parsed && typeof parsed === 'object') {
      const { message } = parsed as { message?: unknown };
      if (typeof message === 'string') {
        return message;
      }
    }
    return trimmed;
  } catch {
    return trimmed;
  }
}

/**
 * Data service that talks to the Money Movement neobank-proxy for MoonPay Iron
 * self-hosted wallet registration. It never calls Iron directly, so the Iron
 * API key never ships in the client.
 */
export class WalletRegistrationService {
  readonly #fetch: FetchLike;

  readonly #baseUrl: string;

  readonly #getAuthToken: () => Promise<string>;

  readonly #getExternalId: () => Promise<string>;

  constructor(options: WalletRegistrationServiceOptions) {
    this.#fetch = options.fetch;
    this.#baseUrl = options.baseUrl.replace(/\/$/u, '');
    this.#getAuthToken = options.getAuthToken;
    this.#getExternalId = options.getExternalId;
  }

  /**
   * Resolves Iron's internal customer id via
   * `GET /neobank/customers/{external_id}/external`, using the MetaMask
   * profile/canonical id as `external_id`. Used when the current KYC flow has
   * not already received `customer.id` from MoonPay's hosted frame.
   *
   * @returns Iron's internal customer id.
   */
  async getMoonpayCustomerId(): Promise<string> {
    const [token, externalId] = await Promise.all([
      this.#getAuthToken(),
      this.#getExternalId(),
    ]);
    if (!externalId) {
      throw new WalletRegistrationError('malformedResponse', {
        message: 'MetaMask external id (canonical profile id) is empty',
      });
    }

    const response = await this.#fetch(
      `${this.#baseUrl}/neobank/customers/${encodeURIComponent(externalId)}/external`,
      {
        method: 'GET',
        headers: {
          accept: 'application/json',
          authorization: `Bearer ${token}`,
        },
      },
    );

    if (!response.ok) {
      throw await this.#toHttpError(response);
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw new WalletRegistrationError('malformedResponse', {
        message: 'MoonPay customer body was not valid JSON',
      });
    }

    const { id } = payload as { id?: unknown };
    if (typeof id !== 'string' || id.length === 0) {
      throw new WalletRegistrationError('malformedResponse', {
        message: 'MoonPay customer body missing id',
      });
    }
    return id;
  }

  /**
   * Reconciles a wallet against the customer's registered self-hosted addresses
   * via `GET /neobank/addresses/crypto/{customer_id}?filter=SelfHosted`.
   * Upstream returns all self-hosted chains; Monad filtering stays client-side
   * for the POC. A failed or malformed lookup is reported as
   * `lookupUnavailable` and never downgraded to `absent`.
   *
   * @param request - Customer id and Monad address to reconcile.
   * @returns The active / disabled / absent status for the address.
   */
  async getRegistrationStatus(
    request: GetRegistrationStatusRequest,
  ): Promise<RegistrationStatus> {
    const { customerId, address, blockchain } = request;

    let response: HttpResponse;
    try {
      const token = await this.#getAuthToken();
      const url = new URL(
        `${this.#baseUrl}/neobank/addresses/crypto/${encodeURIComponent(customerId)}`,
      );
      url.searchParams.set('filter', 'SelfHosted');
      response = await this.#fetch(url.toString(), {
        method: 'GET',
        headers: {
          accept: 'application/json',
          authorization: `Bearer ${token}`,
        },
      });
    } catch (error) {
      throw new WalletRegistrationError('lookupUnavailable', {
        message: 'self-hosted address lookup failed',
        body: error instanceof Error ? error.message : undefined,
      });
    }

    if (!response.ok) {
      const body = await response.text();
      throw new WalletRegistrationError('lookupUnavailable', {
        httpStatus: response.status,
        body: extractErrorBody(body),
      });
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw new WalletRegistrationError('malformedResponse', {
        message: 'self-hosted address list body was not valid JSON',
      });
    }
    if (!Array.isArray(payload)) {
      throw new WalletRegistrationError('malformedResponse', {
        message: 'expected an array of registered addresses',
      });
    }

    const target = normalizeAddress(address);
    const match = payload.find((entry) => {
      const record = entry as Record<string, unknown>;
      const walletAddress = record.wallet_address;
      if (typeof walletAddress !== 'string') {
        return false;
      }
      return (
        normalizeAddress(walletAddress) === target &&
        record.blockchain === blockchain
      );
    }) as Record<string, unknown> | undefined;

    if (!match) {
      return { type: 'absent' };
    }

    const registration = this.#toRegistration(match);
    return registration.disabled
      ? { type: 'disabled', registration }
      : { type: 'active', registration };
  }

  /**
   * Registers a self-hosted wallet through neobank-proxy
   * `POST /neobank/addresses/crypto/selfhosted`. The client supplies
   * `customer_id` and an `Idempotency-Key` (generated when omitted). Every
   * non-2xx response is mapped to a typed error; `409` is deliberately
   * surfaced as an ambiguous `conflict` that the caller must reconcile with a
   * follow-up status lookup.
   *
   * @param request - Customer id, address, blockchain, message, and signature.
   * @returns The registered outcome on success.
   */
  async registerSelfHostedWallet(
    request: RegisterSelfHostedWalletRequest,
  ): Promise<RegistrationOutcome> {
    const idempotencyKey = request.idempotencyKey ?? createIdempotencyKey();
    let response: HttpResponse;
    try {
      const token = await this.#getAuthToken();
      response = await this.#fetch(
        `${this.#baseUrl}/neobank/addresses/crypto/selfhosted`,
        {
          method: 'POST',
          headers: {
            accept: 'application/json',
            'content-type': 'application/json',
            authorization: `Bearer ${token}`,
            'Idempotency-Key': idempotencyKey,
          },
          body: JSON.stringify({
            customer_id: request.customerId,
            address: request.address,
            blockchain: request.blockchain,
            message: request.message,
            signature: request.signature,
          }),
        },
      );
    } catch (error) {
      throw new WalletRegistrationError('transient', {
        message: 'self-hosted registration request failed',
        body: error instanceof Error ? error.message : undefined,
      });
    }

    if (!response.ok) {
      throw await this.#toHttpError(response);
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw new WalletRegistrationError('malformedResponse', {
        message: 'registration success body was not valid JSON',
      });
    }

    const record = payload as Record<string, unknown>;
    if (typeof record.id !== 'string' || typeof record.address !== 'string') {
      throw new WalletRegistrationError('malformedResponse', {
        message: 'registration success body missing id/address',
      });
    }

    return {
      type: 'registered',
      registration: {
        id: record.id,
        address: record.address,
        blockchain: request.blockchain,
        disabled: Boolean(record.disabled),
        isSelf: true,
      },
    };
  }

  async #toHttpError(response: HttpResponse): Promise<WalletRegistrationError> {
    let raw = '';
    try {
      raw = await response.text();
    } catch {
      return new WalletRegistrationError('malformedResponse', {
        httpStatus: response.status,
        message: 'error body could not be read',
      });
    }

    const { status } = response;
    const kind = mapStatusToKind(status);
    const body = extractErrorBody(raw);
    return new WalletRegistrationError(kind, {
      httpStatus: status,
      body,
      message: body || undefined,
    });
  }

  #toRegistration(record: Record<string, unknown>): SelfHostedRegistration {
    return {
      id: String(record.id),
      address: String(record.wallet_address),
      blockchain: 'Monad',
      disabled: Boolean(record.disabled),
      isSelf: Boolean(record.is_self),
    };
  }
}
