import { ConstantBackoff, HttpError } from '@metamask/controller-utils';
import {
  EthMethod,
  SignatureRequestType,
  type SignatureRequest,
} from '@metamask/signature-controller';
import type { TransactionMeta } from '@metamask/transaction-controller';
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
};

export class ShieldRemoteBackend implements ShieldBackend {
  readonly #getAccessToken: () => Promise<string>;

  readonly #baseUrl: string;

  readonly #fetch: typeof globalThis.fetch;

  readonly #pollingPolicy: PollingWithCockatielPolicy;

  constructor({
    getAccessToken,
    getCoverageResultTimeout = 5000, // milliseconds
    getCoverageResultPollInterval = 1000, // milliseconds
    baseUrl,
    fetch: fetchFn,
  }: {
    getAccessToken: () => Promise<string>;
    getCoverageResultTimeout?: number;
    getCoverageResultPollInterval?: number;
    baseUrl: string;
    fetch: typeof globalThis.fetch;
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
    };
  }

  async logSignature(req: LogSignatureRequest): Promise<void> {
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
  }

  async logTransaction(req: LogTransactionRequest): Promise<void> {
    const initBody = makeInitCoverageCheckBody(req.txMeta);
    const body = {
      transactionHash: req.transactionHash,
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
  }

  async #initCoverageCheck(
    path: string,
    reqBody: unknown,
  ): Promise<InitCoverageCheckResponse> {
    const res = await this.#fetch(`${this.#baseUrl}/${path}`, {
      method: 'POST',
      headers: await this.#createHeaders(),
      body: JSON.stringify(reqBody),
    });
    if (res.status !== 200) {
      throw new Error(`Failed to init coverage check: ${res.status}`);
    }
    return (await res.json()) as InitCoverageCheckResponse;
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

    const getCoverageResultFn = async (signal: AbortSignal) => {
      const res = await this.#fetch(coverageResultUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify(reqBody),
        signal,
      });
      if (res.status === 200) {
        return (await res.json()) as GetCoverageResultResponse;
      }

      // parse the error message from the response body
      let errorMessage = 'Timeout waiting for coverage result';
      try {
        const errorJson = await res.json();
        errorMessage = `Timeout waiting for coverage result: ${errorJson.status}`;
      } catch {
        errorMessage = 'Timeout waiting for coverage result';
      }
      throw new HttpError(res.status, errorMessage);
    };

    return this.#pollingPolicy.start(requestId, getCoverageResultFn);
  }

  async #createHeaders() {
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
function makeInitCoverageCheckBody(
  txMeta: TransactionMeta,
): InitCoverageCheckRequest {
  return {
    txParams: [
      {
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
) {
  const backoff = new ConstantBackoff(pollInterval);
  const maxRetries = Math.floor(timeout / pollInterval) + 1;
  return {
    backoff,
    maxRetries,
  };
}
