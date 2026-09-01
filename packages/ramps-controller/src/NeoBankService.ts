import type {
  CreateServicePolicyOptions,
  ServicePolicy,
} from '@metamask/controller-utils';
import {
  createServicePolicy,
  handleWhen,
  HttpError,
} from '@metamask/controller-utils';
import type { Messenger } from '@metamask/messenger';
import type { AuthenticationController } from '@metamask/profile-sync-controller';

import packageJson from '../package.json';
import type {
  AutorampDepositRailsSummary,
  AutorampRemoteSnapshot,
} from './autoramp-types.js';
import type { NeoBankServiceMethodActions } from './NeoBankService-method-action-types.js';
import { RAMPS_SDK_VERSION, RampsEnvironment } from './RampsService.js';
import { WalletRegistrationService } from './wallet-registration-service.js';
import type {
  RegistrationOutcome,
  RegistrationStatus,
} from './wallet-registration-service.js';

/**
 * Name of the NeoBankService messenger namespace.
 */
export const serviceName = 'NeoBankService';

/**
 * Determines whether a failed neo-bank request is worth re-issuing.
 *
 * 4xx responses describe the request or the account's state (e.g. 403
 * "Customer is not active", 422 validation), so repeating them only multiplies
 * the same rejection. 429 stays retryable alongside 5xx and non-HTTP
 * network/timeout errors.
 *
 * @param error - Error thrown while performing the request.
 * @returns `true` when the error is worth retrying.
 */
function isRetryableError(error: unknown): boolean {
  if (error instanceof HttpError) {
    if (error.httpStatus === 429) {
      return true;
    }
    return error.httpStatus < 400 || error.httpStatus >= 500;
  }
  return true;
}

/**
 * Raw autoramp payload from the MetaMask Ramp API neo-bank proxy.
 * Shape mirrors MoonPay Enterprise `GET /api/autoramps/{autoramp_id}`.
 * The Ramp API handles partner auth / headers; the client only sends the
 * MetaMask bearer token.
 */
export type NeoBankAutorampResponse = {
  id: string;
  // eslint-disable-next-line @typescript-eslint/naming-convention -- MoonPay API field
  customer_id?: string;
  status: string;
  /**
   * Destination wallet when present on the proxy response.
   * Field name may evolve with the Ramp API contract.
   */
  // eslint-disable-next-line @typescript-eslint/naming-convention -- MoonPay API field
  wallet_address?: string;
  // eslint-disable-next-line @typescript-eslint/naming-convention -- MoonPay API field
  recipient_account?: {
    address?: string;
  };
  // eslint-disable-next-line @typescript-eslint/naming-convention -- MoonPay API field
  deposit_rails?: unknown[];
};

/**
 * Optional headers for neo-bank mutating requests.
 */
export type NeoBankRequestOptions = {
  /**
   * Forwarded as `Idempotency-Key` when set (MoonPay requires it on some POSTs;
   * neobank-proxy generates one when omitted).
   */
  idempotencyKey?: string;
};

/**
 * Query string values accepted by neo-bank GET helpers.
 */
export type NeoBankQueryParams = Record<
  string,
  string | number | boolean | undefined | null
>;

export type GetWalletRegistrationStatusParams = {
  customerId: string;
  address: string;
};

export type RegisterSelfHostedWalletParams = {
  customerId: string;
  address: string;
  message: string;
  signature: string;
  /**
   * Forwarded as `Idempotency-Key` on the neobank-proxy POST. Prefer a stable
   * key across retries of the same ownership body.
   */
  idempotencyKey?: string;
};

const MESSENGER_EXPOSED_METHODS = [
  'getAutoramp',
  'registerPixAddress',
  'getAutorampQuote',
  'createAutoramp',
  'getAutorampQuoteForAutoramp',
  'attachAutorampQuote',
  'getCustomerByExternalId',
  'getMoonpayCustomerId',
  'getWalletRegistrationStatus',
  'registerSelfHostedWallet',
] as const;

/**
 * Actions that {@link NeoBankService} exposes to other consumers.
 */
export type NeoBankServiceActions = NeoBankServiceMethodActions;

type AllowedActions =
  | AuthenticationController.AuthenticationControllerGetBearerTokenAction
  | AuthenticationController.AuthenticationControllerGetSessionProfileAction;

export type NeoBankServiceEvents = never;

type AllowedEvents = never;

/**
 * The messenger restricted to actions and events accessed by
 * {@link NeoBankService}.
 */
export type NeoBankServiceMessenger = Messenger<
  typeof serviceName,
  NeoBankServiceActions | AllowedActions,
  NeoBankServiceEvents | AllowedEvents
>;

/**
 * Builds a path under the neobank-proxy global prefix.
 *
 * Live neobank-proxy (#1124) mounts routes at `/neobank` on the on-ramp.api
 * host (ALB path routing, no rewrite). Prefer this over `/api/v2/...` so Core
 * matches the proxy that ships.
 *
 * @param path - Path under `/neobank` (no leading slash).
 * @returns Absolute path segment for URL join against the Ramp API host.
 */
function getNeoBankPath(path: string): string {
  return `neobank/${path.replace(/^\//u, '')}`;
}

/**
 * Resolves the Ramp API host for neo-bank calls (same hosts as {@link RampsService}).
 *
 * @param environment - Ramp environment.
 * @returns Base URL.
 */
function getBaseUrl(environment: RampsEnvironment): string {
  switch (environment) {
    case RampsEnvironment.Production:
      return 'https://on-ramp.api.cx.metamask.io';
    case RampsEnvironment.Staging:
      return 'https://on-ramp.uat-api.cx.metamask.io';
    case RampsEnvironment.Development:
      return 'https://on-ramp.dev-api.cx.metamask.io';
    case RampsEnvironment.Local:
      return 'http://localhost:3000';
    default:
      throw new Error(`Invalid environment: ${String(environment)}`);
  }
}

/**
 * Maps a Ramp API / MoonPay-shaped autoramp response into the local remote snapshot.
 *
 * @param response - Proxy response body.
 * @returns Snapshot for the controller last-seen cursor.
 */
export function mapNeoBankAutorampToRemoteSnapshot(
  response: NeoBankAutorampResponse,
): AutorampRemoteSnapshot {
  const depositRails = response.deposit_rails;
  const hasDepositRails =
    Array.isArray(depositRails) && depositRails.length > 0;
  const depositRailsSummary: AutorampDepositRailsSummary | undefined =
    hasDepositRails || response.status === 'Approved'
      ? {
          ready: response.status === 'Approved' && hasDepositRails,
        }
      : undefined;

  return {
    id: response.id,
    customerId: response.customer_id,
    walletAddress:
      response.wallet_address !== undefined &&
      response.wallet_address.length > 0
        ? response.wallet_address
        : response.recipient_account?.address,
    status: response.status,
    depositRailsSummary,
  };
}

/**
 * Client for MetaMask Ramp API neo-bank endpoints (MoonPay Enterprise proxy).
 *
 * Lives alongside {@link RampsService} and {@link TransakService}. Authentication
 * and MoonPay partner headers are handled by the Ramp API; this service only
 * attaches the MetaMask user bearer token.
 *
 * Paths use the neobank-proxy `/neobank` prefix on the on-ramp.api host.
 */
export class NeoBankService {
  readonly name: typeof serviceName;

  readonly #messenger: NeoBankServiceMessenger;

  readonly #fetch: typeof fetch;

  readonly #policy: ServicePolicy;

  readonly #noRetryPolicy: ServicePolicy;

  readonly #environment: RampsEnvironment;

  readonly #context: string;

  readonly #baseUrlOverride?: string;

  #walletRegistrationService: WalletRegistrationService | undefined;

  constructor({
    messenger,
    environment = RampsEnvironment.Staging,
    context,
    fetch: fetchFunction,
    policyOptions = {},
    baseUrlOverride,
  }: {
    messenger: NeoBankServiceMessenger;
    environment?: RampsEnvironment;
    context: string;
    fetch: typeof fetch;
    policyOptions?: CreateServicePolicyOptions;
    baseUrlOverride?: string;
  }) {
    this.name = serviceName;
    this.#messenger = messenger;
    this.#fetch = fetchFunction;
    this.#policy = createServicePolicy({
      retryFilterPolicy: handleWhen(isRetryableError),
      ...policyOptions,
    });
    this.#noRetryPolicy = createServicePolicy({
      retryFilterPolicy: handleWhen(isRetryableError),
      ...policyOptions,
      maxRetries: 0,
    });
    this.#environment = environment;
    this.#context = context;
    this.#baseUrlOverride = baseUrlOverride;

    this.#messenger.registerMethodActionHandlers(
      this,
      MESSENGER_EXPOSED_METHODS,
    );
  }

  #getBaseUrl(): string {
    if (this.#baseUrlOverride) {
      return this.#baseUrlOverride;
    }
    return getBaseUrl(this.#environment);
  }

  /**
   * Lazily builds the wallet registration client. Deferred so constructing the
   * service never resolves the base URL eagerly (an invalid environment only
   * throws when a request is made, matching the other neo-bank methods).
   *
   * @returns The wallet registration client.
   */
  #getWalletRegistrationService(): WalletRegistrationService {
    this.#walletRegistrationService ??= new WalletRegistrationService({
      fetch: this.#fetch,
      baseUrl: this.#getBaseUrl(),
      getAuthToken: async (): Promise<string> =>
        this.#messenger.call('AuthenticationController:getBearerToken'),
      getExternalId: async (): Promise<string> =>
        this.#getCanonicalExternalId(),
    });
    return this.#walletRegistrationService;
  }

  async #getRequestHeaders(
    options: NeoBankRequestOptions = {},
  ): Promise<Record<string, string>> {
    const bearerToken = await this.#messenger.call(
      'AuthenticationController:getBearerToken',
    );
    const headers: Record<string, string> = {
      Authorization: `Bearer ${bearerToken}`,
    };
    if (options.idempotencyKey) {
      headers['Idempotency-Key'] = options.idempotencyKey;
    }
    return headers;
  }

  #buildUrl(path: string, query?: NeoBankQueryParams): URL {
    const url = new URL(getNeoBankPath(path), this.#getBaseUrl());
    url.searchParams.set('sdk', RAMPS_SDK_VERSION);
    url.searchParams.set('controller', packageJson.version);
    url.searchParams.set('context', this.#context);
    if (query) {
      for (const [key, value] of Object.entries(query)) {
        if (value !== undefined && value !== null) {
          url.searchParams.set(key, String(value));
        }
      }
    }
    return url;
  }

  /**
   * Throws an {@link HttpError} that carries the upstream response body.
   *
   * The neobank-proxy mirrors MoonPay's status *and* body verbatim, so the
   * body is usually the only place that explains a 4xx (e.g. which field or
   * permission was rejected). Dropping it makes failures undiagnosable.
   *
   * @param url - Request URL, for context in the message.
   * @param response - Non-OK fetch response.
   */
  async #throwHttpError(url: URL, response: Response): Promise<never> {
    let detail = '';
    try {
      const body = (await response.text()).trim();
      if (body) {
        detail = ` - ${body.slice(0, 500)}`;
      }
    } catch {
      // Body already consumed or unreadable; the status alone still helps.
    }
    throw new HttpError(
      response.status,
      `Fetching '${url.toString()}' failed with status '${response.status}'${detail}`,
    );
  }

  async #getJson<ResponseBody>(
    path: string,
    query?: NeoBankQueryParams,
  ): Promise<ResponseBody> {
    const url = this.#buildUrl(path, query);
    return this.#policy.execute(async () => {
      const headers = await this.#getRequestHeaders();
      const fetchResponse = await this.#fetch(url, { headers });
      if (!fetchResponse.ok) {
        await this.#throwHttpError(url, fetchResponse);
      }
      return fetchResponse.json() as Promise<ResponseBody>;
    });
  }

  async #postJson<ResponseBody>(
    path: string,
    body: Record<string, unknown>,
    options: NeoBankRequestOptions,
  ): Promise<ResponseBody> {
    const url = this.#buildUrl(path);
    return this.#noRetryPolicy.execute(async () => {
      const headers = await this.#getRequestHeaders(options);
      headers['Content-Type'] = 'application/json';
      const fetchResponse = await this.#fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      });
      if (!fetchResponse.ok) {
        await this.#throwHttpError(url, fetchResponse);
      }
      return fetchResponse.json() as Promise<ResponseBody>;
    });
  }

  #mapAutorampResponse(
    response: NeoBankAutorampResponse,
  ): AutorampRemoteSnapshot {
    if (!response || typeof response !== 'object' || !response.id) {
      throw new Error('Malformed response received from neo-bank autoramp API');
    }
    return mapNeoBankAutorampToRemoteSnapshot(response);
  }

  /**
   * Fetches an autoramp account via neobank-proxy
   * `GET /neobank/autoramps/{autoramp_id}` (MoonPay
   * `GET /api/autoramps/{autoramp_id}`).
   *
   * @param autorampId - MoonPay / Ramp API autoramp id.
   * @returns Remote snapshot for controller apply/refresh.
   */
  async getAutoramp(autorampId: string): Promise<AutorampRemoteSnapshot> {
    const response = await this.#getJson<NeoBankAutorampResponse>(
      `autoramps/${encodeURIComponent(autorampId)}`,
    );
    return this.#mapAutorampResponse(response);
  }

  /**
   * Registers a Pix address via neobank-proxy `POST /neobank/addresses/pix`.
   * Body is forwarded as opaque JSON (MoonPay address schema).
   *
   * @param body - Pix address registration payload.
   * @param options - Optional idempotency key.
   * @returns Parsed proxy JSON response.
   */
  async registerPixAddress(
    body: Record<string, unknown>,
    options: NeoBankRequestOptions = {},
  ): Promise<unknown> {
    return this.#postJson('addresses/pix', body, options);
  }

  /**
   * Fetches an autoramp quote via neobank-proxy `GET /neobank/autoramps/quote`.
   *
   * @param query - Quote query params (forwarded as-is).
   * @returns Parsed proxy JSON response.
   */
  async getAutorampQuote(query: NeoBankQueryParams = {}): Promise<unknown> {
    return this.#getJson('autoramps/quote', query);
  }

  /**
   * Creates an autoramp from a signed quote via neobank-proxy
   * `POST /neobank/autoramps` (MoonPay `POST /api/autoramps`).
   *
   * @param body - CreateAutoramp / signed-quote payload (forwarded as-is).
   * @param options - Optional idempotency key.
   * @returns Remote snapshot for controller apply/refresh.
   */
  async createAutoramp(
    body: Record<string, unknown>,
    options: NeoBankRequestOptions = {},
  ): Promise<AutorampRemoteSnapshot> {
    const response = await this.#postJson<NeoBankAutorampResponse>(
      'autoramps',
      body,
      options,
    );
    return this.#mapAutorampResponse(response);
  }

  /**
   * Fetches a quote for an existing autoramp via neobank-proxy
   * `GET /neobank/autoramps/{autoramp_id}/quote`.
   *
   * @param autorampId - Autoramp id.
   * @param query - Quote query params (forwarded as-is).
   * @returns Parsed proxy JSON response.
   */
  async getAutorampQuoteForAutoramp(
    autorampId: string,
    query: NeoBankQueryParams = {},
  ): Promise<unknown> {
    return this.#getJson(
      `autoramps/${encodeURIComponent(autorampId)}/quote`,
      query,
    );
  }

  /**
   * Attaches a signed quote to an autoramp via neobank-proxy
   * `POST /neobank/autoramps/{autoramp_id}/quotes`.
   *
   * @param autorampId - Autoramp id.
   * @param body - Quote attachment payload (forwarded as-is).
   * @param options - Optional idempotency key.
   * @returns Parsed proxy JSON response.
   */
  async attachAutorampQuote(
    autorampId: string,
    body: Record<string, unknown>,
    options: NeoBankRequestOptions = {},
  ): Promise<unknown> {
    return this.#postJson(
      `autoramps/${encodeURIComponent(autorampId)}/quotes`,
      body,
      options,
    );
  }

  /**
   * Fetches a customer by partner external id via neobank-proxy
   * `GET /neobank/customers/{external_id}/external`.
   *
   * @param externalId - Partner-assigned external customer id.
   * @returns Parsed proxy JSON response.
   */
  async getCustomerByExternalId(externalId: string): Promise<unknown> {
    return this.#getJson(
      `customers/${encodeURIComponent(externalId)}/external`,
    );
  }

  /**
   * Resolves Iron's internal customer id via neobank-proxy customer lookup,
   * using the MetaMask canonical profile id as the partner `external_id`.
   *
   * @returns Iron's internal customer id.
   */
  async getMoonpayCustomerId(): Promise<string> {
    return await this.#getWalletRegistrationService().getMoonpayCustomerId();
  }

  /**
   * Checks whether a Monad Money Account address is already registered for the
   * given Iron customer.
   *
   * @param params - Customer id and address to check.
   * @param params.customerId - Iron / MoonPay customer UUID.
   * @param params.address - Money Account address.
   * @returns Active, disabled, or absent registration status.
   */
  async getWalletRegistrationStatus({
    customerId,
    address,
  }: GetWalletRegistrationStatusParams): Promise<RegistrationStatus> {
    return await this.#getWalletRegistrationService().getRegistrationStatus({
      customerId,
      address,
      blockchain: 'Monad',
    });
  }

  /**
   * Submits a signed Monad Money Account ownership proof via neobank-proxy
   * `POST /neobank/addresses/crypto/selfhosted`.
   *
   * @param params - Signed ownership proof.
   * @returns Registered wallet record.
   */
  async registerSelfHostedWallet(
    params: RegisterSelfHostedWalletParams,
  ): Promise<RegistrationOutcome> {
    return await this.#getWalletRegistrationService().registerSelfHostedWallet({
      ...params,
      blockchain: 'Monad',
    });
  }

  /**
   * Resolves the MetaMask canonical profile id used as MoonPay's partner
   * `external_id` for neobank customer lookup.
   *
   * @returns Canonical profile id.
   */
  async #getCanonicalExternalId(): Promise<string> {
    const profile = await this.#messenger.call(
      'AuthenticationController:getSessionProfile',
    );
    const canonical = profile?.canonicalProfileId;
    const externalId =
      typeof canonical === 'string' && canonical.length > 0
        ? canonical
        : profile?.profileId;
    if (typeof externalId !== 'string' || externalId.length === 0) {
      throw new Error(
        'Unable to resolve MetaMask canonical profile id for MoonPay customer lookup',
      );
    }
    return externalId;
  }

  onRetry(
    listener: Parameters<ServicePolicy['onRetry']>[0],
  ): ReturnType<ServicePolicy['onRetry']> {
    return this.#policy.onRetry(listener);
  }

  onBreak(
    listener: Parameters<ServicePolicy['onBreak']>[0],
  ): ReturnType<ServicePolicy['onBreak']> {
    return this.#policy.onBreak(listener);
  }

  onDegraded(
    listener: Parameters<ServicePolicy['onDegraded']>[0],
  ): ReturnType<ServicePolicy['onDegraded']> {
    return this.#policy.onDegraded(listener);
  }
}
