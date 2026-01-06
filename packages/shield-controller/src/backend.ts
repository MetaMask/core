import {
  ConstantBackoff,
  DEFAULT_MAX_RETRIES,
  HttpError,
} from '@metamask/controller-utils';
import {
  EthMethod,
  SignatureRequestType,
} from '@metamask/signature-controller';
import type { SignatureRequest } from '@metamask/signature-controller';
import type { TransactionMeta } from '@metamask/transaction-controller';
import type { AuthorizationList } from '@metamask/transaction-controller';
import type { Json } from '@metamask/utils';

import { SignTypedDataVersion } from './constants';
import { PollingWithCockatielPolicy } from './polling-with-policy';
import type {
  CheckCoverageRequest,
  CheckSignatureCoverageRequest,
  CoverageResult,
  CoverageStatus,
  LogSignatureRequest,
  LogTransactionRequest,
  ShieldBackend,
} from './types';

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

export class ShieldRemoteBackend implements ShieldBackend {
  readonly #getAccessToken: () => Promise<string>;

  readonly #baseUrl: string;

  readonly #fetch: typeof globalThis.fetch;

  readonly #pollingPolicy: PollingWithCockatielPolicy;

  readonly #captureException?: (error: Error) => void;

  constructor({
    getAccessToken,
    getCoverageResultTimeout = 5000, // milliseconds
    getCoverageResultPollInterval = 1000, // milliseconds
    baseUrl,
    fetch: fetchFn,
    captureException,
  }: {
    getAccessToken: () => Promise<string>;
    getCoverageResultTimeout?: number;
    getCoverageResultPollInterval?: number;
    baseUrl: string;
    fetch: typeof globalThis.fetch;
    captureException?: (error: Error) => void;
  }) {
    this.#getAccessToken = getAccessToken;
    this.#baseUrl = baseUrl;
    this.#fetch = fetchFn;

    const { backoff, maxRetries } = computePollingIntervalAndRetryCount(
      getCoverageResultTimeout,
      getCoverageResultPollInterval,
    );

    this.#pollingPolicy = new PollingWithCockatielPolicy({
      backoff,
      maxRetries,
    });

    this.#captureException = captureException;
  }

  async checkCoverage(req: CheckCoverageRequest): Promise<CoverageResult> {
    let { coverageId } = req;
    if (!coverageId) {
      const reqBody = makeInitCoverageCheckBody(req.txMeta);
      ({ coverageId } = await this.#initCoverageCheck(
        'v1/transaction/coverage/init',
        reqBody,
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

  async checkSignatureCoverage(
    req: CheckSignatureCoverageRequest,
  ): Promise<CoverageResult> {
    let { coverageId } = req;
    if (!coverageId) {
      const reqBody = makeInitSignatureCoverageCheckBody(req.signatureRequest);
      ({ coverageId } = await this.#initCoverageCheck(
        'v1/signature/coverage/init',
        reqBody,
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

  async logSignature(req: LogSignatureRequest): Promise<void> {
    try {
      const initBody = makeInitSignatureCoverageCheckBody(req.signatureRequest);
      const body = {
        signature: req.signature,
        status: req.status,
        ...initBody,
      };

      // cancel the pending get coverage result request
      this.#pollingPolicy.abortPendingRequest(req.signatureRequest.id);

      const res = await this.#fetch(
        `${this.#baseUrl}/v1/signature/coverage/log`,
        {
          method: 'POST',
          headers: await this.#createHeaders(),
          body: JSON.stringify(body),
        },
      );
      if (res.status !== 200) {
        throw new Error(`Failed to log signature: ${res.status}`);
      }
    } catch (error) {
      const sentryError = createSentryError(
        'Failed to log signature',
        error as Error,
      );
      this.#captureException?.(sentryError);

      // rethrow the original error
      throw error;
    }
  }

  async logTransaction(req: LogTransactionRequest): Promise<void> {
    try {
      const initBody = makeInitCoverageCheckBody(req.txMeta);

      const body = {
        transactionHash: req.transactionHash,
        rawTransactionHex: req.rawTransactionHex,
        status: req.status,
        ...initBody,
      };

      // cancel the pending get coverage result request
      this.#pollingPolicy.abortPendingRequest(req.txMeta.id);

      const res = await this.#fetch(
        `${this.#baseUrl}/v1/transaction/coverage/log`,
        {
          method: 'POST',
          headers: await this.#createHeaders(),
          body: JSON.stringify(body),
        },
      );
      if (res.status !== 200) {
        throw new Error(`Failed to log transaction: ${res.status}`);
      }
    } catch (error) {
      const sentryError = createSentryError(
        'Failed to log transaction',
        error as Error,
      );
      this.#captureException?.(sentryError);

      // rethrow the original error
      throw error;
    }
  }

  async #initCoverageCheck(
    path: string,
    reqBody: unknown,
  ): Promise<InitCoverageCheckResponse> {
    try {
      const res = await this.#fetch(`${this.#baseUrl}/${path}`, {
        method: 'POST',
        headers: await this.#createHeaders(),
        body: JSON.stringify(reqBody),
      });
      if (res.status !== 200) {
        throw new Error(`Failed to init coverage check: ${res.status}`);
      }
      return (await res.json()) as InitCoverageCheckResponse;
    } catch (error) {
      const sentryError = createSentryError(
        'Failed to init coverage check',
        error as Error,
      );
      this.#captureException?.(sentryError);

      // rethrow the original error
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

    const headers = await this.#createHeaders();

    // Start measuring total end-to-end latency including retries and delays
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
        // Return the result without latency here - we'll add total latency after polling completes
        return (await res.json()) as Omit<GetCoverageResultResponse, 'metrics'>;
      }

      // parse the error message from the response body
      let errorMessage = 'Timeout waiting for coverage result';
      try {
        const errorJson = await res.json();
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

    // Calculate total end-to-end latency including all retries and delays
    const now = Date.now();
    const totalLatency = now - startTime;

    return {
      ...result,
      metrics: { latency: totalLatency },
    } as GetCoverageResultResponse;
  }

  async #createHeaders(): Promise<Record<string, string>> {
    const accessToken = await this.#getAccessToken();
    return {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
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
  // TODO: confirm that do we still need to validate the signature data?
  // signature controller already validates the signature data before adding it to the state.
  // @link https://github.com/MetaMask/core/blob/main/packages/signature-controller/src/SignatureController.ts#L408
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
