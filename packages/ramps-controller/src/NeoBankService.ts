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

const MESSENGER_EXPOSED_METHODS = ['getAutoramp'] as const;

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
 * Builds an `/api/v2/...` path for the Ramp API neo-bank proxy.
 *
 * @param path - Path under the versioned API root (no leading slash).
 * @param version - API version segment.
 * @returns Versioned API path.
 */
function getApiPath(path: string, version: string = 'v2'): string {
  return `api/${version}/${path.replace(/^\//u, '')}`;
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
      response.wallet_address ?? response.recipient_account?.address,
    status: response.status,
    depositRailsSummary,
  };
}

/**
 * Client for MetaMask Ramp API neo-bank endpoints (MoonPay Enterprise proxy).
 *
 * Lives alongside {@link RampsService} and {@link TransakService}. Authentication
 * and MoonPay partner headers are handled by the Ramp API — this service only
 * attaches the MetaMask user bearer token.
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

  async #getRequestHeaders(): Promise<Record<string, string>> {
    const bearerToken = await this.#messenger.call(
      'AuthenticationController:getBearerToken',
    );
    return {
      Authorization: `Bearer ${bearerToken}`,
    };
  }

  /**
   * Fetches an autoramp account via the Ramp API proxy of
   * MoonPay `GET /api/autoramps/{autoramp_id}`.
   *
   * @param autorampId - MoonPay / Ramp API autoramp id.
   * @returns Remote snapshot for controller apply/refresh.
   */
  async getAutoramp(autorampId: string): Promise<AutorampRemoteSnapshot> {
    const url = new URL(
      getApiPath(`autoramps/${encodeURIComponent(autorampId)}`),
      this.#getBaseUrl(),
    );
    url.searchParams.set('sdk', RAMPS_SDK_VERSION);
    url.searchParams.set('controller', packageJson.version);
    url.searchParams.set('context', this.#context);

    const response = await this.#policy.execute(async () => {
      const headers = await this.#getRequestHeaders();
      const fetchResponse = await this.#fetch(url, { headers });
      if (!fetchResponse.ok) {
        throw new HttpError(
          fetchResponse.status,
          `Fetching '${url.toString()}' failed with status '${fetchResponse.status}'`,
        );
      }
      return fetchResponse.json() as Promise<NeoBankAutorampResponse>;
    });

    if (!response || typeof response !== 'object' || !response.id) {
      throw new Error('Malformed response received from neo-bank autoramp API');
    }

    return mapNeoBankAutorampToRemoteSnapshot(response);
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
