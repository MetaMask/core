import { BaseDataService } from '@metamask/base-data-service';
import type {
  DataServiceCacheUpdatedEvent,
  DataServiceGranularCacheUpdatedEvent,
  DataServiceInvalidateQueriesAction,
} from '@metamask/base-data-service';
import type { CreateServicePolicyOptions } from '@metamask/controller-utils';
import {
  ConstantBackoff,
  DEFAULT_MAX_RETRIES,
  HttpError,
} from '@metamask/controller-utils';
import type { Messenger } from '@metamask/messenger';
import type { AuthenticationController } from '@metamask/profile-sync-controller';
import {
  EthMethod,
  SignatureRequestType,
} from '@metamask/signature-controller';
import type { SignatureRequest } from '@metamask/signature-controller';
import type { TransactionMeta } from '@metamask/transaction-controller';
import type { AuthorizationList } from '@metamask/transaction-controller';
import type { Json } from '@metamask/utils';
import type { QueryClientConfig } from '@tanstack/query-core';

import { Env, getShieldApiBaseUrl, SignTypedDataVersion } from './constants.js';
import { PollingWithCockatielPolicy } from './polling-with-policy.js';
import type { ShieldApiServiceMethodActions } from './shield-api-service-method-action-types.js';
import type {
  CheckCoverageRequest,
  CheckSignatureCoverageRequest,
  CoverageResult,
  CoverageStatus,
  LogSignatureRequest,
  LogTransactionRequest,
} from './types.js';

export type InitCoverageCheckRequest = {
  txParams: [
    {
      authorizationList?: AuthorizationList;
      from: string;
      to?: string;
      value?: string;
      data?: string;
      nonce?: string;
    },
  ];
  chainId: string;
  origin?: string;
};

export type InitSignatureCoverageCheckRequest = {
  chainId: string;
  data: Json;
  from: string;
  method: string;
  origin?: string;
};

export type InitCoverageCheckResponse = {
  coverageId: string;
};

export type GetCoverageResultRequest = {
  coverageId: string;
};

export type GetCoverageResultResponse = {
  message?: string;
  reasonCode?: string;
  status: CoverageStatus;
  metrics: {
    latency?: number;
  };
};

/**
 * The name of the {@link ShieldApiService}, used to namespace the service's
 * actions and events.
 */
export const serviceName = 'ShieldApiService';

const MESSENGER_EXPOSED_METHODS = [
  'checkCoverage',
  'checkSignatureCoverage',
  'logSignature',
  'logTransaction',
] as const;

const DEFAULT_POLICY_OPTIONS: CreateServicePolicyOptions = {
  maxRetries: 0,
};

/**
 * Invalidates cached queries for {@link ShieldApiService}.
 */
export type ShieldApiServiceInvalidateQueriesAction =
  DataServiceInvalidateQueriesAction<typeof serviceName>;

/**
 * Actions that {@link ShieldApiService} exposes to other consumers.
 */
export type ShieldApiServiceActions =
  | ShieldApiServiceMethodActions
  | ShieldApiServiceInvalidateQueriesAction;

/**
 * Actions from other messengers that {@link ShieldApiService} calls.
 */
type AllowedActions =
  AuthenticationController.AuthenticationControllerGetBearerTokenAction;

/**
 * Published when {@link ShieldApiService}'s cache is updated.
 */
export type ShieldApiServiceCacheUpdatedEvent = DataServiceCacheUpdatedEvent<
  typeof serviceName
>;

/**
 * Published when a key within {@link ShieldApiService}'s cache is updated.
 */
export type ShieldApiServiceGranularCacheUpdatedEvent =
  DataServiceGranularCacheUpdatedEvent<typeof serviceName>;

/**
 * Events that {@link ShieldApiService} exposes to other consumers.
 */
export type ShieldApiServiceEvents =
  | ShieldApiServiceCacheUpdatedEvent
  | ShieldApiServiceGranularCacheUpdatedEvent;

/**
 * Events from other messengers that {@link ShieldApiService} subscribes to.
 */
type AllowedEvents = never;

/**
 * The messenger which is restricted to actions and events accessed by
 * {@link ShieldApiService}.
 */
export type ShieldApiServiceMessenger = Messenger<
  typeof serviceName,
  ShieldApiServiceActions | AllowedActions,
  ShieldApiServiceEvents | AllowedEvents
>;

/**
 * This service is responsible for communicating with the Shield API.
 *
 * All requests are authenticated via JWT Bearer tokens obtained from the
 * `AuthenticationController:getBearerToken` messenger action.
 */
export class ShieldApiService extends BaseDataService<
  typeof serviceName,
  ShieldApiServiceMessenger
> {
  readonly #baseUrl: string;

  readonly #fetch: typeof globalThis.fetch;

  readonly #pollingPolicy: PollingWithCockatielPolicy;

  readonly #captureException?: (error: Error) => void;

  /**
   * Constructs a new ShieldApiService.
   *
   * @param args - The constructor arguments.
   * @param args.messenger - The messenger suited for this service.
   * @param args.env - The environment used to resolve the Shield API URL.
   * @param args.fetch - The fetch implementation. Defaults to `globalThis.fetch`.
   * @param args.captureException - Optional error reporter.
   * @param args.getCoverageResultTimeout - Timeout for coverage result polling.
   * @param args.getCoverageResultPollInterval - Poll interval for coverage results.
   * @param args.queryClientConfig - Configuration for the underlying TanStack
   * Query client.
   * @param args.policyOptions - Options to pass to `createServicePolicy`.
   */
  constructor({
    messenger,
    env,
    fetch: fetchFn = globalThis.fetch,
    captureException: captureExceptionFn,
    getCoverageResultTimeout = 5000,
    getCoverageResultPollInterval = 1000,
    queryClientConfig = {},
    policyOptions = {},
  }: {
    messenger: ShieldApiServiceMessenger;
    env: Env;
    /**
     * The `fetch` function to use for requests. Defaults to the global `fetch`.
     */
    fetch?: typeof globalThis.fetch;
    captureException?: (error: Error) => void;
    getCoverageResultTimeout?: number;
    getCoverageResultPollInterval?: number;
    queryClientConfig?: QueryClientConfig;
    policyOptions?: CreateServicePolicyOptions;
  }) {
    super({
      name: serviceName,
      messenger,
      queryClientConfig,
      policyOptions: { ...DEFAULT_POLICY_OPTIONS, ...policyOptions },
    });

    this.#baseUrl = getShieldApiBaseUrl(env);
    this.#fetch = fetchFn;

    const { backoff, maxRetries } = computePollingIntervalAndRetryCount(
      getCoverageResultTimeout,
      getCoverageResultPollInterval,
    );

    this.#pollingPolicy = new PollingWithCockatielPolicy({
      backoff,
      maxRetries,
    });

    this.#captureException = (error: Error): void => {
      try {
        captureExceptionFn?.(error);
      } catch {
        // ignore error thrown when calling captureException
      }
    };

    this.messenger.registerMethodActionHandlers(
      this,
      MESSENGER_EXPOSED_METHODS,
    );
  }

  /**
   * Checks the coverage of a transaction.
   *
   * @param req - The coverage check request.
   * @returns The coverage result.
   */
  async checkCoverage(req: CheckCoverageRequest): Promise<CoverageResult> {
    let { coverageId } = req;
    if (!coverageId) {
      const reqBody = makeInitCoverageCheckBody(req.txMeta);
      ({ coverageId } = await this.#initCoverageCheck(
        'v1/transaction/coverage/init',
        reqBody,
        req.txMeta.id,
      ));
    }

    const txCoverageResultUrl = `${this.#baseUrl}/v1/transaction/coverage/result`;
    const coverageResult = await this.#getCoverageResult(
      req.txMeta.id,
      coverageId,
      txCoverageResultUrl,
    );
    return {
      coverageId,
      message: coverageResult.message,
      reasonCode: coverageResult.reasonCode,
      status: coverageResult.status,
      metrics: coverageResult.metrics,
    };
  }

  /**
   * Checks the coverage of a signature request.
   *
   * @param req - The signature coverage check request.
   * @returns The coverage result.
   */
  async checkSignatureCoverage(
    req: CheckSignatureCoverageRequest,
  ): Promise<CoverageResult> {
    let { coverageId } = req;
    if (!coverageId) {
      const reqBody = makeInitSignatureCoverageCheckBody(req.signatureRequest);
      ({ coverageId } = await this.#initCoverageCheck(
        'v1/signature/coverage/init',
        reqBody,
        req.signatureRequest.id,
      ));
    }

    const signatureCoverageResultUrl = `${this.#baseUrl}/v1/signature/coverage/result`;
    const coverageResult = await this.#getCoverageResult(
      req.signatureRequest.id,
      coverageId,
      signatureCoverageResultUrl,
    );
    return {
      coverageId,
      message: coverageResult.message,
      reasonCode: coverageResult.reasonCode,
      status: coverageResult.status,
      metrics: coverageResult.metrics,
    };
  }

  /**
   * Logs a signed signature request.
   *
   * @param req - The log signature request.
   */
  async logSignature(req: LogSignatureRequest): Promise<void> {
    try {
      const initBody = makeInitSignatureCoverageCheckBody(req.signatureRequest);
      const body = {
        signature: req.signature,
        status: req.status,
        ...initBody,
      };

      this.#pollingPolicy.abortPendingRequest(req.signatureRequest.id);

      const headers = await this.#authHeaders();

      await this.fetchQuery({
        queryKey: [
          `${this.name}:logSignature`,
          req.signatureRequest.id,
          req.status,
        ],
        staleTime: 0,
        gcTime: 0,
        queryFn: async () => {
          const res = await this.#fetch(
            `${this.#baseUrl}/v1/signature/coverage/log`,
            {
              method: 'POST',
              headers,
              body: JSON.stringify(body),
            },
          );
          if (res.status !== 200) {
            throw new HttpError(
              res.status,
              `Failed to log signature: ${res.status}`,
            );
          }
          return null;
        },
      });
    } catch (error) {
      const sentryError = createSentryError(
        'Failed to log signature',
        error as Error,
      );
      this.#captureException?.(sentryError);
      throw error;
    }
  }

  /**
   * Logs a submitted transaction.
   *
   * @param req - The log transaction request.
   */
  async logTransaction(req: LogTransactionRequest): Promise<void> {
    try {
      const initBody = makeInitCoverageCheckBody(req.txMeta);
      const body = {
        transactionHash: req.transactionHash,
        rawTransactionHex: req.rawTransactionHex,
        status: req.status,
        ...initBody,
      };

      this.#pollingPolicy.abortPendingRequest(req.txMeta.id);

      const headers = await this.#authHeaders();

      await this.fetchQuery({
        queryKey: [
          `${this.name}:logTransaction`,
          req.txMeta.id,
          req.transactionHash,
          req.status,
        ],
        staleTime: 0,
        gcTime: 0,
        queryFn: async () => {
          const res = await this.#fetch(
            `${this.#baseUrl}/v1/transaction/coverage/log`,
            {
              method: 'POST',
              headers,
              body: JSON.stringify(body),
            },
          );
          if (res.status !== 200) {
            throw new HttpError(
              res.status,
              `Failed to log transaction: ${res.status}`,
            );
          }
          return null;
        },
      });
    } catch (error) {
      const sentryError = createSentryError(
        'Failed to log transaction',
        error as Error,
      );
      this.#captureException?.(sentryError);
      throw error;
    }
  }

  async #initCoverageCheck(
    path: string,
    reqBody: unknown,
    requestId: string,
  ): Promise<InitCoverageCheckResponse> {
    try {
      const headers = await this.#authHeaders();

      return await this.fetchQuery({
        queryKey: [`${this.name}:initCoverageCheck`, path, requestId],
        staleTime: 0,
        gcTime: 0,
        queryFn: async () => {
          const res = await this.#fetch(`${this.#baseUrl}/${path}`, {
            method: 'POST',
            headers,
            body: JSON.stringify(reqBody),
          });
          if (res.status !== 200) {
            throw new HttpError(
              res.status,
              `Failed to init coverage check: ${res.status}`,
            );
          }
          return (await res.json()) as InitCoverageCheckResponse;
        },
      });
    } catch (error) {
      const sentryError = createSentryError(
        'Failed to init coverage check',
        error as Error,
      );
      this.#captureException?.(sentryError);
      throw error;
    }
  }

  async #getCoverageResult(
    requestId: string,
    coverageId: string,
    coverageResultUrl: string,
  ): Promise<GetCoverageResultResponse> {
    const reqBody: GetCoverageResultRequest = {
      coverageId,
    };

    const headers = await this.#authHeaders();
    const startTime = Date.now();

    const getCoverageResultFn = async (
      signal: AbortSignal,
    ): Promise<Omit<GetCoverageResultResponse, 'metrics'>> => {
      const res = await this.#fetch(coverageResultUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify(reqBody),
        signal,
      });

      if (res.status === 200) {
        return (await res.json()) as Omit<GetCoverageResultResponse, 'metrics'>;
      }

      let errorMessage = 'Timeout waiting for coverage result';
      try {
        const errorJson = (await res.json()) as {
          message?: string;
          status?: string;
        };
        errorMessage = `Failed to get coverage result: ${errorJson.message ?? errorJson.status}`;
      } catch {
        errorMessage = `Failed to get coverage result: ${res.status}`;
      }
      throw new HttpError(res.status, errorMessage);
    };

    const result = await this.#pollingPolicy.start(
      requestId,
      getCoverageResultFn,
    );

    const totalLatency = Date.now() - startTime;

    return {
      ...result,
      metrics: { latency: totalLatency },
    } as GetCoverageResultResponse;
  }

  async #authHeaders(): Promise<Record<string, string>> {
    const token = await this.messenger.call(
      'AuthenticationController:getBearerToken',
    );
    return {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    };
  }
}

/**
 * Make the body for the init coverage check request.
 *
 * @param txMeta - The transaction metadata.
 * @returns The body for the init coverage check request.
 */
export function makeInitCoverageCheckBody(
  txMeta: TransactionMeta,
): InitCoverageCheckRequest {
  return {
    txParams: [
      {
        authorizationList: txMeta.txParams.authorizationList,
        from: txMeta.txParams.from,
        to: txMeta.txParams.to,
        value: txMeta.txParams.value,
        data: txMeta.txParams.data,
        nonce: txMeta.txParams.nonce,
      },
    ],
    chainId: txMeta.chainId,
    origin: txMeta.origin,
  };
}

/**
 * Make the body for the init signature coverage check request.
 *
 * @param signatureRequest - The signature request.
 * @returns The body for the init signature coverage check request.
 */
function makeInitSignatureCoverageCheckBody(
  signatureRequest: SignatureRequest,
): InitSignatureCoverageCheckRequest {
  const method = parseSignatureRequestMethod(signatureRequest);

  return {
    chainId: signatureRequest.chainId,
    data: signatureRequest.messageParams.data,
    from: signatureRequest.messageParams.from,
    method,
    origin: signatureRequest.messageParams.origin,
  };
}

/**
 * Parse the JSON-RPC method from the signature request.
 *
 * @param signatureRequest - The signature request.
 * @returns The JSON-RPC method.
 */
export function parseSignatureRequestMethod(
  signatureRequest: SignatureRequest,
): string {
  if (signatureRequest.type === SignatureRequestType.TypedSign) {
    switch (signatureRequest.version) {
      case SignTypedDataVersion.V3:
        return EthMethod.SignTypedDataV3;
      case SignTypedDataVersion.V4:
        return EthMethod.SignTypedDataV4;
      case SignTypedDataVersion.V1:
      default:
        return SignatureRequestType.TypedSign;
    }
  }

  return signatureRequest.type;
}

/**
 * Compute the polling interval and retry count for the Cockatiel policy based on the timeout and poll interval given.
 *
 * @param timeout - The timeout in milliseconds.
 * @param pollInterval - The poll interval in milliseconds.
 * @returns The polling interval and retry count.
 */
function computePollingIntervalAndRetryCount(
  timeout: number,
  pollInterval: number,
): { backoff: ConstantBackoff; maxRetries: number } {
  const backoff = new ConstantBackoff(pollInterval);
  const computedMaxRetries = Math.floor(timeout / pollInterval) + 1;

  const maxRetries =
    isNaN(computedMaxRetries) || !isFinite(computedMaxRetries)
      ? DEFAULT_MAX_RETRIES
      : computedMaxRetries;

  return {
    backoff,
    maxRetries,
  };
}

/**
 * Create an error instance with a readable message, a cause and a context for Sentry.
 *
 * @param errorMessage - The error message.
 * @param cause - The cause of the error.
 * @returns A Sentry error.
 */
function createSentryError(errorMessage: string, cause: Error): Error {
  const error = new Error(errorMessage) as Error & {
    cause: Error;
  };
  error.cause = cause;
  return error;
}
