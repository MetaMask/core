import { BaseDataService } from '@metamask/base-data-service';
import type {
  CreateServicePolicyOptions,
  DataServiceCacheUpdatedEvent,
  DataServiceGranularCacheUpdatedEvent,
  DataServiceInvalidateQueriesAction,
} from '@metamask/base-data-service';
import { HttpError } from '@metamask/controller-utils';
import type { Messenger } from '@metamask/messenger';
import type { Infer } from '@metamask/superstruct';
import { array, boolean, object, string } from '@metamask/superstruct';

import type { ComplianceServiceMethodActions } from './ComplianceService-method-action-types.js';

// === GENERAL ===

/**
 * The name of the {@link ComplianceService}, used to namespace the service's
 * actions and events.
 */
export const serviceName = 'ComplianceService';

/**
 * The supported environments for the Compliance API.
 */
export type ComplianceServiceEnvironment = 'production' | 'development';

const COMPLIANCE_API_URLS: Record<ComplianceServiceEnvironment, string> = {
  production: 'https://compliance.api.cx.metamask.io',
  development: 'https://compliance.dev-api.cx.metamask.io',
};

export type ComplianceServiceOptions = {
  messenger: ComplianceServiceMessenger;
  fetch: typeof fetch;
  /**
   * Explicit Compliance API URL. Prefer this for application builds so API
   * endpoints can be managed by build configuration. Path components are
   * preserved as a base path for Compliance API routes.
   */
  apiUrl?: string;
  /**
   * Fallback environment used when `apiUrl` is not provided.
   */
  env?: ComplianceServiceEnvironment;
  policyOptions?: CreateServicePolicyOptions;
};

// === MESSENGER ===

const MESSENGER_EXPOSED_METHODS = [
  'checkWalletCompliance',
  'checkWalletsCompliance',
] as const;

/**
 * Invalidates cached queries for {@link ComplianceService}.
 */
export type ComplianceServiceInvalidateQueriesAction =
  DataServiceInvalidateQueriesAction<typeof serviceName>;

/**
 * Actions that {@link ComplianceService} exposes to other consumers.
 */
export type ComplianceServiceActions =
  | ComplianceServiceMethodActions
  | ComplianceServiceInvalidateQueriesAction;

/**
 * Actions from other messengers that {@link ComplianceService} calls.
 */
type AllowedActions = never;

/**
 * Published when {@link ComplianceService}'s cache is updated.
 */
export type ComplianceServiceCacheUpdatedEvent = DataServiceCacheUpdatedEvent<
  typeof serviceName
>;

/**
 * Published when a key within {@link ComplianceService}'s cache is updated.
 */
export type ComplianceServiceGranularCacheUpdatedEvent =
  DataServiceGranularCacheUpdatedEvent<typeof serviceName>;

/**
 * Events that {@link ComplianceService} exposes to other consumers.
 */
export type ComplianceServiceEvents =
  | ComplianceServiceCacheUpdatedEvent
  | ComplianceServiceGranularCacheUpdatedEvent;

/**
 * Events from other messengers that {@link ComplianceService} subscribes to.
 */
type AllowedEvents = never;

/**
 * The messenger restricted to actions and events accessed by
 * {@link ComplianceService}.
 */
export type ComplianceServiceMessenger = Messenger<
  typeof serviceName,
  ComplianceServiceActions | AllowedActions,
  ComplianceServiceEvents | AllowedEvents
>;

// === API RESPONSE SCHEMAS ===

/**
 * Schema for the response from `GET /v1/wallet/:address`.
 */
const WalletCheckResponseStruct = object({
  address: string(),
  blocked: boolean(),
});

/**
 * The validated shape of a single wallet compliance check response.
 */
type WalletCheckResponse = Infer<typeof WalletCheckResponseStruct>;

/**
 * Schema for each item in the response from `POST /v1/wallet/batch`.
 * Reuses the same shape as a single wallet check.
 */
const BatchWalletCheckResponseItemStruct = WalletCheckResponseStruct;

/**
 * The validated shape of a single item in a batch compliance check response.
 */
type BatchWalletCheckResponseItem = Infer<
  typeof BatchWalletCheckResponseItemStruct
>;

// === SERVICE DEFINITION ===

/**
 * `ComplianceService` communicates with the Compliance API to check whether
 * wallet addresses are sanctioned under OFAC regulations.
 *
 * @example
 *
 * ``` ts
 * import { Messenger } from '@metamask/messenger';
 * import type {
 *   ComplianceServiceActions,
 *   ComplianceServiceEvents,
 * } from '@metamask/compliance-controller';
 * import { ComplianceService } from '@metamask/compliance-controller';
 *
 * const rootMessenger = new Messenger<
 *   'Root',
 *   ComplianceServiceActions,
 *   ComplianceServiceEvents,
 * >({ namespace: 'Root' });
 * const serviceMessenger = new Messenger<
 *   'ComplianceService',
 *   ComplianceServiceActions,
 *   ComplianceServiceEvents,
 *   typeof rootMessenger,
 * >({
 *   namespace: 'ComplianceService',
 *   parent: rootMessenger,
 * });
 * new ComplianceService({
 *   messenger: serviceMessenger,
 *   fetch,
 *   apiUrl: 'https://compliance.api.cx.metamask.io',
 * });
 *
 * // Check a single wallet
 * const result = await rootMessenger.call(
 *   'ComplianceService:checkWalletCompliance',
 *   '0x1234...',
 * );
 * // => { address: '0x1234...', blocked: false }
 * ```
 */
export class ComplianceService extends BaseDataService<
  typeof serviceName,
  ComplianceServiceMessenger
> {
  /**
   * A function that can be used to make an HTTP request.
   */
  readonly #fetch: typeof fetch;

  /**
   * The resolved base URL for the Compliance API.
   */
  readonly #complianceApiUrl: string;

  /**
   * Constructs a new ComplianceService object.
   *
   * @param args - The constructor arguments.
   * @param args.messenger - The messenger suited for this service.
   * @param args.fetch - A function that can be used to make an HTTP request.
   * @param args.apiUrl - The explicit Compliance API URL.
   * @param args.env - The fallback environment to use for the Compliance API
   * when `apiUrl` is not provided.
   * @param args.policyOptions - Options to pass to `createServicePolicy`, which
   * is used to wrap each request. See {@link CreateServicePolicyOptions}.
   */
  constructor({
    messenger,
    fetch: fetchFunction,
    apiUrl,
    env = 'production',
    policyOptions = {},
  }: ComplianceServiceOptions) {
    super({ name: serviceName, messenger, policyOptions });
    this.#fetch = fetchFunction;
    this.#complianceApiUrl = getComplianceApiUrl({ apiUrl, env });

    this.messenger.registerMethodActionHandlers(
      this,
      MESSENGER_EXPOSED_METHODS,
    );
  }

  /**
   * Checks compliance status for a single wallet address.
   *
   * @param address - The wallet address to check.
   * @returns The compliance status of the wallet.
   */
  async checkWalletCompliance(address: string): Promise<WalletCheckResponse> {
    return this.fetchQuery({
      queryKey: [`${this.name}:checkWalletCompliance`, address],
      staleTime: 0,
      gcTime: 0,
      responseStruct: WalletCheckResponseStruct,
      queryFn: async () => {
        const url = new URL(
          `v1/wallet/${encodeURIComponent(address)}`,
          this.#complianceApiUrl,
        );
        const response = await this.#fetch(url);
        if (!response.ok) {
          throw new HttpError(
            response.status,
            `Fetching '${url.toString()}' failed with status '${response.status}'`,
          );
        }
        // Validated against `responseStruct` by `BaseDataService`.
        return (await response.json()) as WalletCheckResponse;
      },
    });
  }

  /**
   * Checks compliance status for multiple wallet addresses in a single request.
   *
   * @param addresses - The wallet addresses to check.
   * @returns The compliance statuses of the wallets.
   */
  async checkWalletsCompliance(
    addresses: string[],
  ): Promise<BatchWalletCheckResponseItem[]> {
    return this.fetchQuery({
      queryKey: [`${this.name}:checkWalletsCompliance`, addresses],
      staleTime: 0,
      gcTime: 0,
      responseStruct: array(BatchWalletCheckResponseItemStruct),
      queryFn: async () => {
        const url = new URL('v1/wallet/batch', this.#complianceApiUrl);
        const response = await this.#fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(addresses),
        });
        if (!response.ok) {
          throw new HttpError(
            response.status,
            `Fetching '${url.toString()}' failed with status '${response.status}'`,
          );
        }
        // Validated against `responseStruct` by `BaseDataService`.
        return (await response.json()) as BatchWalletCheckResponseItem[];
      },
    });
  }
}

function getComplianceApiUrl({
  apiUrl,
  env,
}: {
  apiUrl?: string;
  env: ComplianceServiceEnvironment;
}): string {
  if (apiUrl === undefined) {
    return COMPLIANCE_API_URLS[env];
  }

  let url: URL;
  try {
    url = new URL(apiUrl);
  } catch {
    throw new Error(`Invalid Compliance API URL: ${apiUrl}`);
  }

  if (url.search || url.hash) {
    throw new Error(
      `Invalid Compliance API URL: ${apiUrl}. Query strings and fragments are not supported.`,
    );
  }
  if (!url.pathname.endsWith('/')) {
    url.pathname = `${url.pathname}/`;
  }
  return url.href;
}
