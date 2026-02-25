import type {
  CreateServicePolicyOptions,
  ServicePolicy,
} from '@metamask/controller-utils';
import { createServicePolicy, HttpError } from '@metamask/controller-utils';
import type { Messenger } from '@metamask/messenger';
import type { Infer } from '@metamask/superstruct';
import { array, boolean, number, object, string } from '@metamask/superstruct';
import type { IDisposable } from 'cockatiel';

import type { ComplianceServiceMethodActions } from './ComplianceService-method-action-types';

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

// === MESSENGER ===

const MESSENGER_EXPOSED_METHODS = [
  'checkWalletCompliance',
  'checkWalletsCompliance',
  'updateBlockedWallets',
] as const;

/**
 * Actions that {@link ComplianceService} exposes to other consumers.
 */
export type ComplianceServiceActions = ComplianceServiceMethodActions;

/**
 * Actions from other messengers that {@link ComplianceService} calls.
 */
type AllowedActions = never;

/**
 * Events that {@link ComplianceService} exposes to other consumers.
 */
export type ComplianceServiceEvents = never;

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

/**
 * Schema for the response from `GET /v1/blocked-wallets`.
 */
const BlockedWalletsResponseStruct = object({
  addresses: array(string()),
  sources: object({
    ofac: number(),
    remote: number(),
  }),
  lastUpdated: string(),
});

/**
 * The validated shape of the blocked wallets response.
 */
type BlockedWalletsResponse = Infer<typeof BlockedWalletsResponseStruct>;

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
 *   env: 'production',
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
export class ComplianceService {
  /**
   * The name of the service.
   */
  readonly name: typeof serviceName;

  /**
   * The messenger suited for this service.
   */
  readonly #messenger: ConstructorParameters<
    typeof ComplianceService
  >[0]['messenger'];

  /**
   * A function that can be used to make an HTTP request.
   */
  readonly #fetch: ConstructorParameters<typeof ComplianceService>[0]['fetch'];

  /**
   * The resolved base URL for the Compliance API.
   */
  readonly #complianceApiUrl: string;

  /**
   * The policy that wraps each request.
   *
   * @see {@link createServicePolicy}
   */
  readonly #policy: ServicePolicy;

  /**
   * Constructs a new ComplianceService object.
   *
   * @param args - The constructor arguments.
   * @param args.messenger - The messenger suited for this service.
   * @param args.fetch - A function that can be used to make an HTTP request.
   * @param args.env - The environment to use for the Compliance API. Determines
   * the base URL.
   * @param args.policyOptions - Options to pass to `createServicePolicy`, which
   * is used to wrap each request. See {@link CreateServicePolicyOptions}.
   */
  constructor({
    messenger,
    fetch: fetchFunction,
    env,
    policyOptions = {},
  }: {
    messenger: ComplianceServiceMessenger;
    fetch: typeof fetch;
    env: ComplianceServiceEnvironment;
    policyOptions?: CreateServicePolicyOptions;
  }) {
    this.name = serviceName;
    this.#messenger = messenger;
    this.#fetch = fetchFunction;
    this.#complianceApiUrl = COMPLIANCE_API_URLS[env];
    this.#policy = createServicePolicy(policyOptions);

    this.#messenger.registerMethodActionHandlers(
      this,
      MESSENGER_EXPOSED_METHODS,
    );
  }

  /**
   * Registers a handler that will be called after a request returns a non-500
   * response, causing a retry.
   *
   * @param listener - The handler to be called.
   * @returns An object that can be used to unregister the handler.
   * @see {@link createServicePolicy}
   */
  onRetry(listener: Parameters<ServicePolicy['onRetry']>[0]): IDisposable {
    return this.#policy.onRetry(listener);
  }

  /**
   * Registers a handler that will be called after a set number of retry rounds
   * prove that requests to the API endpoint consistently return a 5xx response.
   *
   * @param listener - The handler to be called.
   * @returns An object that can be used to unregister the handler.
   * @see {@link createServicePolicy}
   */
  onBreak(listener: Parameters<ServicePolicy['onBreak']>[0]): IDisposable {
    return this.#policy.onBreak(listener);
  }

  /**
   * Registers a handler that will be called when the service is degraded due
   * to slow responses or repeated failures.
   *
   * @param listener - The handler to be called.
   * @returns An object that can be used to unregister the handler.
   * @see {@link createServicePolicy}
   */
  onDegraded(
    listener: Parameters<ServicePolicy['onDegraded']>[0],
  ): IDisposable {
    return this.#policy.onDegraded(listener);
  }

  /**
   * Checks compliance status for a single wallet address.
   *
   * @param address - The wallet address to check.
   * @returns The compliance status of the wallet.
   */
  async checkWalletCompliance(address: string): Promise<WalletCheckResponse> {
    const response = await this.#policy.execute(async () => {
      const url = new URL(
        `/v1/wallet/${encodeURIComponent(address)}`,
        this.#complianceApiUrl,
      );
      const localResponse = await this.#fetch(url);
      if (!localResponse.ok) {
        throw new HttpError(
          localResponse.status,
          `Fetching '${url.toString()}' failed with status '${localResponse.status}'`,
        );
      }
      return localResponse;
    });
    const jsonResponse: unknown = await response.json();

    return validateResponse(
      jsonResponse,
      WalletCheckResponseStruct,
      'compliance wallet check API',
    );
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
    const response = await this.#policy.execute(async () => {
      const url = new URL('/v1/wallet/batch', this.#complianceApiUrl);
      const localResponse = await this.#fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(addresses),
      });
      if (!localResponse.ok) {
        throw new HttpError(
          localResponse.status,
          `Fetching '${url.toString()}' failed with status '${localResponse.status}'`,
        );
      }
      return localResponse;
    });
    const jsonResponse: unknown = await response.json();

    return validateResponse(
      jsonResponse,
      array(BatchWalletCheckResponseItemStruct),
      'compliance batch check API',
    );
  }

  /**
   * Fetches the full list of blocked wallets and source metadata.
   *
   * @returns The blocked wallets data.
   */
  async updateBlockedWallets(): Promise<BlockedWalletsResponse> {
    const response = await this.#policy.execute(async () => {
      const url = new URL('/v1/blocked-wallets', this.#complianceApiUrl);
      const localResponse = await this.#fetch(url);
      if (!localResponse.ok) {
        throw new HttpError(
          localResponse.status,
          `Fetching '${url.toString()}' failed with status '${localResponse.status}'`,
        );
      }
      return localResponse;
    });
    const jsonResponse: unknown = await response.json();

    return validateResponse(
      jsonResponse,
      BlockedWalletsResponseStruct,
      'compliance blocked wallets API',
    );
  }
}

/**
 * Validates an API response against a superstruct schema.
 *
 * @param data - The raw response data to validate.
 * @param struct - The superstruct schema to validate against.
 * @param struct.is - The type guard function from the schema.
 * @param apiName - A human-readable name for the API, used in error messages.
 * @returns The validated data.
 * @throws If the data does not match the schema.
 */
function validateResponse<Response>(
  data: unknown,
  struct: { is: (value: unknown) => value is Response },
  apiName: string,
): Response {
  if (struct.is(data)) {
    return data;
  }
  throw new Error(`Malformed response received from ${apiName}`);
}
