import type { SignatureRequest } from '@metamask/signature-controller';
import type { TransactionMeta } from '@metamask/transaction-controller';

import { PollingWithTimeout } from './polling-with-timeout';
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
  data: string;
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

  readonly #getCoverageResultTimeout: number;

  readonly #getCoverageResultPollInterval: number;

  readonly #baseUrl: string;

  readonly #fetch: typeof globalThis.fetch;

  readonly #pollingWithTimeout: PollingWithTimeout;

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
    this.#getCoverageResultTimeout = getCoverageResultTimeout;
    this.#getCoverageResultPollInterval = getCoverageResultPollInterval;
    this.#baseUrl = baseUrl;
    this.#fetch = fetchFn;
    this.#pollingWithTimeout = new PollingWithTimeout({
      timeout: getCoverageResultTimeout,
      pollInterval: getCoverageResultPollInterval,
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
    const coverageResult = await this.#getCoverageResult(coverageId, {
      requestId: req.txMeta.id,
      coverageResultUrl: txCoverageResultUrl,
    });
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
    const coverageResult = await this.#getCoverageResult(coverageId, {
      requestId: req.signatureRequest.id,
      coverageResultUrl: signatureCoverageResultUrl,
    });
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
    coverageId: string,
    config: {
      requestId: string;
      coverageResultUrl: string;
      timeout?: number;
      pollInterval?: number;
    },
  ): Promise<GetCoverageResultResponse> {
    const reqBody: GetCoverageResultRequest = {
      coverageId,
    };
    const pollingOptions = {
      timeout: config.timeout ?? this.#getCoverageResultTimeout,
      pollInterval: config.pollInterval ?? this.#getCoverageResultPollInterval,
    };
    const headers = await this.#createHeaders();

    return await new Promise((resolve, reject) => {
      const requestCoverageFn = async (
        signal: AbortSignal,
      ): Promise<GetCoverageResultResponse> => {
        const res = await this.#fetch(config.coverageResultUrl, {
          method: 'POST',
          headers,
          body: JSON.stringify(reqBody),
          signal,
        });
        if (res.status === 200) {
          return (await res.json()) as GetCoverageResultResponse;
        }
        throw new Error(`Failed to get coverage result: ${res.status}`);
      };

      this.#pollingWithTimeout
        .pollRequest(config.requestId, requestCoverageFn, pollingOptions)
        .then(resolve)
        .catch(() => reject(new Error('Timeout waiting for coverage result')));
    });
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
  if (typeof signatureRequest.messageParams.data !== 'string') {
    throw new Error('Signature data must be a string');
  }

  return {
    chainId: signatureRequest.chainId,
    data: signatureRequest.messageParams.data as string,
    from: signatureRequest.messageParams.from,
    method: signatureRequest.type,
    origin: signatureRequest.messageParams.origin,
  };
}
