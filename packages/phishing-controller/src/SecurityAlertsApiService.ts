import {
  BaseDataService,
  BrokenCircuitError,
  handleWhen,
} from '@metamask/base-data-service';
import type {
  CreateServicePolicyOptions,
  DataServiceCacheUpdatedEvent,
  DataServiceGranularCacheUpdatedEvent,
  DataServiceInvalidateQueriesAction,
} from '@metamask/base-data-service';
import type { Messenger } from '@metamask/messenger';
import type { Json } from '@metamask/utils';

import {
  ApprovalDashboardError,
  buildApprovalDashboardRequestBody,
  invalidApprovalDashboardResponse,
  parseApprovalDashboardResponse,
} from './approval-dashboard.js';
import type {
  ApprovalDashboardRequest,
  ApprovalDashboardResponse,
} from './approval-dashboard.js';
import { SECURITY_ALERTS_BASE_URL } from './PhishingController.js';
import type { SecurityAlertsApiServiceMethodActions } from './SecurityAlertsApiService-method-action-types.js';

export const serviceName = 'SecurityAlertsApiService';

export const APPROVAL_DASHBOARD_ENDPOINT = '/approvals/dashboard';

/** Per-attempt deadline. SAA bounds its own upstream work at 8 seconds. */
export const APPROVAL_DASHBOARD_TIMEOUT_MS = 15_000;

const MESSENGER_EXPOSED_METHODS = ['getApprovalDashboard'] as const;

export type SecurityAlertsApiServiceActions =
  | SecurityAlertsApiServiceMethodActions
  | DataServiceInvalidateQueriesAction<typeof serviceName>;

export type SecurityAlertsApiServiceEvents =
  | DataServiceCacheUpdatedEvent<typeof serviceName>
  | DataServiceGranularCacheUpdatedEvent<typeof serviceName>;

export type SecurityAlertsApiServiceMessenger = Messenger<
  typeof serviceName,
  SecurityAlertsApiServiceActions,
  SecurityAlertsApiServiceEvents
>;

export type SecurityAlertsApiServiceOptions = {
  /** The messenger suited for this service. */
  messenger: SecurityAlertsApiServiceMessenger;
  /** The `fetch` function to use for requests. Defaults to the global `fetch`. */
  fetch?: typeof fetch;
  /** Security Alerts API base URL. Defaults to production. */
  baseUrl?: string;
  /**
   * Options to pass to `createServicePolicy`. Retries are disabled by default
   * (`maxRetries: 0`); when enabled, only errors with `retryable: true` are
   * retried.
   */
  policyOptions?: CreateServicePolicyOptions;
};

/**
 * Data service for the MetaMask Security Alerts API
 * (`security-alerts.api.cx.metamask.io`).
 */
export class SecurityAlertsApiService extends BaseDataService<
  typeof serviceName,
  SecurityAlertsApiServiceMessenger
> {
  readonly #fetch: typeof fetch;

  readonly #baseUrl: string;

  /**
   * Constructs a new SecurityAlertsApiService.
   *
   * @param options - The constructor options. See
   * {@link SecurityAlertsApiServiceOptions}.
   * @param options.messenger - The messenger suited for this service.
   * @param options.fetch - The `fetch` function to use for requests.
   * @param options.baseUrl - The Security Alerts API base URL.
   * @param options.policyOptions - Options to pass to `createServicePolicy`.
   */
  constructor({
    messenger,
    fetch: fetchFunction = globalThis.fetch,
    baseUrl = SECURITY_ALERTS_BASE_URL,
    policyOptions = {},
  }: SecurityAlertsApiServiceOptions) {
    super({
      name: serviceName,
      messenger,
      policyOptions: {
        maxRetries: 0,
        retryFilterPolicy: handleWhen(
          (error) => error instanceof ApprovalDashboardError && error.retryable,
        ),
        ...policyOptions,
      },
    });

    this.#fetch = fetchFunction;
    this.#baseUrl = baseUrl;

    this.messenger.registerMethodActionHandlers(
      this,
      MESSENGER_EXPOSED_METHODS,
    );
  }

  /**
   * Get the normalized multi-chain token approval inventory for an account
   * (`POST /approvals/dashboard`).
   *
   * Failures are never reported as an empty inventory: the call rejects with
   * an `ApprovalDashboardError`. A resolved response carries per-chain status
   * and completeness in `chainResults`; a chain that is not `verified` must
   * not be shown as having no approvals.
   *
   * There is no per-call cancellation: identical concurrent calls share one
   * request, bounded by a 15-second timeout. Callers that no longer need a
   * response (e.g. after an account or network switch) should discard it.
   *
   * @param request - The dashboard request.
   * @param request.address - The EVM account address.
   * @param request.chainIds - Hex chain IDs (e.g. `'0x1'`); at most 20
   * distinct.
   * @param request.forceFresh - Ask the server to bypass the allowance cache.
   * The server may throttle this; see `freshness.forced` on the response.
   * @returns The validated approval inventory.
   */
  async getApprovalDashboard(
    request: ApprovalDashboardRequest,
  ): Promise<ApprovalDashboardResponse> {
    const body = buildApprovalDashboardRequestBody(request);

    const response = await this.fetchQuery({
      queryKey: [`${this.name}:getApprovalDashboard`, body],
      staleTime: 0,
      queryFn: async (): Promise<Json> =>
        parseApprovalDashboardResponse(
          await this.#postApprovalDashboard(body),
          body,
        ),
    }).catch((error: unknown) => {
      if (error instanceof BrokenCircuitError) {
        throw new ApprovalDashboardError(
          'service_unavailable',
          'Security Alerts API is temporarily unavailable',
          { retryable: true, cause: error },
        );
      }
      throw error;
    });

    return response as ApprovalDashboardResponse;
  }

  /**
   * POST the request body, enforcing the per-attempt deadline.
   *
   * @param body - The SAA request body.
   * @returns The parsed JSON body.
   */
  async #postApprovalDashboard(body: object): Promise<unknown> {
    // A timer rather than `AbortSignal.timeout`, which React Native lacks.
    const controller = new AbortController();
    const timer = setTimeout(
      () => controller.abort(),
      APPROVAL_DASHBOARD_TIMEOUT_MS,
    );
    const transportError = (error: unknown): ApprovalDashboardError =>
      controller.signal.aborted
        ? new ApprovalDashboardError(
            'timeout',
            `Approval dashboard request timed out after ${APPROVAL_DASHBOARD_TIMEOUT_MS}ms`,
            { retryable: true, cause: error },
          )
        : new ApprovalDashboardError(
            'network_error',
            'Approval dashboard request failed',
            { retryable: true, cause: error },
          );

    try {
      let response: Response;
      try {
        response = await this.#fetch(
          `${this.#baseUrl}${APPROVAL_DASHBOARD_ENDPOINT}`,
          {
            method: 'POST',
            headers: {
              Accept: 'application/json',
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(body),
            signal: controller.signal,
          },
        );
      } catch (error) {
        throw transportError(error);
      }

      if (!response.ok) {
        throw new ApprovalDashboardError(
          'http_error',
          `Approval dashboard request failed: ${response.status} ${response.statusText}`,
          {
            httpStatus: response.status,
            retryable: response.status === 429 || response.status >= 500,
          },
        );
      }

      try {
        return await response.json();
      } catch (error) {
        throw controller.signal.aborted
          ? transportError(error)
          : invalidApprovalDashboardResponse('body is not valid JSON', error);
      }
    } finally {
      clearTimeout(timer);
    }
  }
}
