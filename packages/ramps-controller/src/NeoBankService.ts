import type {
  CreateServicePolicyOptions,
  ServicePolicy,
} from '@metamask/controller-utils';
import { createServicePolicy, HttpError } from '@metamask/controller-utils';
import type { Messenger } from '@metamask/messenger';
import type { AuthenticationController } from '@metamask/profile-sync-controller';

import packageJson from '../package.json';
import type {
  AutorampDepositRailsSummary,
  AutorampRemoteSnapshot,
} from './autorampAccount.js';
import type { NeoBankServiceMethodActions } from './NeoBankService-method-action-types.js';
import { RAMPS_SDK_VERSION, RampsEnvironment } from './RampsService.js';

/**
 * Name of the NeoBankService messenger namespace.
 */
export const serviceName = 'NeoBankService';

/**
 * Raw autoramp payload from the MetaMask Ramp API neo-bank proxy.
 * Shape mirrors MoonPay Enterprise `GET /api/autoramps/{autoramp_id}`.
 * The Ramp API handles partner auth / headers; the client only sends the
 * MetaMask bearer token.
 */
export type NeoBankAutorampResponse = {
  id: string;
  customer_id: string;
  status: string;
  /**
   * Destination wallet when present on the proxy response.
   * Field name may evolve with the Ramp API contract.
   */
  wallet_address?: string;
  recipient_account?: {
    address?: string;
  };
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

const MESSENGER_EXPOSED_METHODS = [
  'getAutoramp',
  'registerPixAddress',
  'getAutorampQuote',
  'createAutoramp',
  'getAutorampQuoteForAutoramp',
  'attachAutorampQuote',
  'getCustomerByExternalId',
] as const;

/**
 * Actions that {@link NeoBankService} exposes to other consumers.
 */
export type NeoBankServiceActions = NeoBankServiceMethodActions;

type AllowedActions =
  AuthenticationController.AuthenticationControllerGetBearerTokenAction;

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
 * Extracts the first usable Crypto deposit Hex from Iron `deposit_rails`.
 * Used by {@link mapNeoBankAutorampToRemoteSnapshot} so offramp create responses
 * that only populate rails (not top-level `wallet_address`) still yield a
 * counterparty address for vault withdraw / `addAutoramp`.
 *
 * @param depositRails - Raw `deposit_rails` array from the proxy response.
 * @returns First Crypto rail `address` that looks like a Hex, or undefined.
 */
export function extractIronCryptoDepositAddress(
  depositRails: unknown,
): string | undefined {
  if (!Array.isArray(depositRails)) {
    return undefined;
  }
  for (const rail of depositRails) {
    if (!rail || typeof rail !== 'object' || Array.isArray(rail)) {
      continue;
    }
    const typed = rail as { type?: unknown; address?: unknown };
    if (
      typed.type === 'Crypto' &&
      typeof typed.address === 'string' &&
      /^0x[a-fA-F0-9]{40}$/u.test(typed.address)
    ) {
      return typed.address;
    }
  }
  return undefined;
}

/**
 * Maps a Ramp API / MoonPay-shaped autoramp response into the local remote snapshot.
 *
 * `walletAddress` is the crypto counterparty for the ramp direction: onramp
 * destination wallet, or offramp Iron crypto deposit address. Prefer
 * top-level `wallet_address` / `recipient_account.address`; fall back to the
 * first usable `deposit_rails` Crypto Hex so crypto→Pix creates are usable.
 *
 * @param response - Proxy response body.
 * @returns Snapshot consumed by {@link applyAutorampRemoteStatus}.
 */
export function mapNeoBankAutorampToRemoteSnapshot(
  response: NeoBankAutorampResponse,
): AutorampRemoteSnapshot {
  const depositRails = response.deposit_rails;
  const hasDepositRails = Array.isArray(depositRails) && depositRails.length > 0;
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
      response.wallet_address ??
      response.recipient_account?.address ??
      extractIronCryptoDepositAddress(depositRails),
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

  readonly #environment: RampsEnvironment;

  readonly #context: string;

  readonly #baseUrlOverride?: string;

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
    this.#policy = createServicePolicy(policyOptions);
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

  async #getJson<T>(
    path: string,
    query?: NeoBankQueryParams,
  ): Promise<T> {
    const url = this.#buildUrl(path, query);
    return this.#policy.execute(async () => {
      const headers = await this.#getRequestHeaders();
      const fetchResponse = await this.#fetch(url, { headers });
      if (!fetchResponse.ok) {
        throw new HttpError(
          fetchResponse.status,
          `Fetching '${url.toString()}' failed with status '${fetchResponse.status}'`,
        );
      }
      return fetchResponse.json() as Promise<T>;
    });
  }

  async #postJson<T>(
    path: string,
    body: Record<string, unknown>,
    options: NeoBankRequestOptions,
  ): Promise<T> {
    const url = this.#buildUrl(path);
    return this.#policy.execute(async () => {
      const headers = await this.#getRequestHeaders(options);
      headers['Content-Type'] = 'application/json';
      const fetchResponse = await this.#fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      });
      if (!fetchResponse.ok) {
        throw new HttpError(
          fetchResponse.status,
          `Fetching '${url.toString()}' failed with status '${fetchResponse.status}'`,
        );
      }
      return fetchResponse.json() as Promise<T>;
    });
  }

  #mapAutorampResponse(response: NeoBankAutorampResponse): AutorampRemoteSnapshot {
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
