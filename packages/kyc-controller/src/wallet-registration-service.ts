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
    signal?: unknown;
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
  baseUrl: string;
  getAuthToken: () => Promise<string>;
};

export type GetRegistrationStatusRequest = {
  address: string;
  blockchain: Blockchain;
};

export type RegisterSelfHostedWalletRequest = {
  customerId: string;
  address: string;
  blockchain: Blockchain;
  message: string;
  signature: string;
};

/** Successful registration outcome. */
export type RegistrationOutcome = {
  type: 'registered';
  registration: SelfHostedRegistration;
};

const SELF_HOSTED_PATH = '/vendors/moonpay/self-hosted-wallets';

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
 * Data service that talks to the MetaMask backend proxy for MoonPay Iron
 * self-hosted wallet registration. It never calls Iron directly, so the Iron
 * API key never ships in the client.
 */
export class WalletRegistrationService {
  readonly #fetch: FetchLike;

  readonly #baseUrl: string;

  readonly #getAuthToken: () => Promise<string>;

  constructor(options: WalletRegistrationServiceOptions) {
    this.#fetch = options.fetch;
    this.#baseUrl = options.baseUrl.replace(/\/$/u, '');
    this.#getAuthToken = options.getAuthToken;
  }

  /**
   * Reconciles a wallet against the customer's registered self-hosted addresses.
   * A failed or malformed lookup is reported as `lookupUnavailable` and never
   * downgraded to `absent`.
   *
   * @param request - Monad address to reconcile.
   * @returns The active / disabled / absent status for the address.
   */
  async getRegistrationStatus(
    request: GetRegistrationStatusRequest,
  ): Promise<RegistrationStatus> {
    const { address, blockchain } = request;

    let response: HttpResponse;
    try {
      const token = await this.#getAuthToken();
      response = await this.#fetch(`${this.#baseUrl}${SELF_HOSTED_PATH}`, {
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
        body,
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
   * Registers a self-hosted wallet through the MetaMask proxy. The proxy
   * resolves the customer, derives the idempotency key, and attaches the API
   * version, so the client never manages those. Every non-2xx response is
   * mapped to a typed error; `409` is deliberately surfaced as an ambiguous
   * `conflict` that the caller must reconcile with a follow-up status lookup.
   *
   * @param request - Customer id, address, blockchain, message, and signature.
   * @returns The registered outcome on success.
   */
  async registerSelfHostedWallet(
    request: RegisterSelfHostedWalletRequest,
  ): Promise<RegistrationOutcome> {
    let response: HttpResponse;
    try {
      const token = await this.#getAuthToken();
      response = await this.#fetch(`${this.#baseUrl}${SELF_HOSTED_PATH}`, {
        method: 'POST',
        headers: {
          accept: 'application/json',
          'content-type': 'application/json',
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          customer_id: request.customerId,
          address: request.address,
          blockchain: request.blockchain,
          message: request.message,
          signature: request.signature,
        }),
      });
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
    let envelope: { message?: string };
    try {
      envelope = (await response.json()) as { message?: string };
    } catch {
      return new WalletRegistrationError('malformedResponse', {
        httpStatus: response.status,
        message: 'error body was not valid JSON',
      });
    }

    const { status } = response;
    const kind = mapStatusToKind(status);
    return new WalletRegistrationError(kind, {
      httpStatus: status,
      body: envelope.message,
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
