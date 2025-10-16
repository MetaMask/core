import type { SignatureRequest } from '@metamask/signature-controller';
import type { TransactionMeta } from '@metamask/transaction-controller';

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

  #abortController: AbortController | undefined;

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

    // cancel/abort any pending coverage result polling before logging the signature
    this.#abortPendingPollingRequests();

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

    // cancel/abort any pending coverage result polling before logging the transaction
    this.#abortPendingPollingRequests();

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
    configs: {
      coverageResultUrl: string;
      timeout?: number;
      pollInterval?: number;
    },
  ): Promise<GetCoverageResultResponse> {
    if (this.#abortController && !this.#abortController.signal.aborted) {
      // cancel the previous ongoing requests/polling before starting a new one
      this.#abortController.abort();
    }
    const abortController = new AbortController();
    this.#abortController = abortController;

    const reqBody: GetCoverageResultRequest = {
      coverageId,
    };

    const headers = await this.#createHeaders();
    const timeout = configs?.timeout ?? this.#getCoverageResultTimeout;
    const pollInterval =
      configs?.pollInterval ?? this.#getCoverageResultPollInterval;

    let shouldContinuePolling = true;
    const poll = async (): Promise<GetCoverageResultResponse> => {
      // Poll until the coverage result is ready or the abort signal is triggered.
      while (shouldContinuePolling && !abortController.signal.aborted) {
        const startTime = Date.now();
        const res = await this.#fetch(configs.coverageResultUrl, {
          method: 'POST',
          headers,
          body: JSON.stringify(reqBody),
          signal: abortController.signal,
        });
        if (res.status === 200) {
          shouldContinuePolling = false;
          return (await res.json()) as GetCoverageResultResponse;
        }
        if (!abortController.signal.aborted) {
          await sleep(pollInterval - (Date.now() - startTime));
        }
      }
      // The following line will not have an effect as the upper level promise
      // will already be rejected by now.
      throw new Error('unexpected error');
    };

    return await withTimeoutAndCancellation<GetCoverageResultResponse>(
      poll,
      timeout,
      abortController,
    );
  }

  async #createHeaders() {
    const accessToken = await this.#getAccessToken();
    return {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    };
  }

  #abortPendingPollingRequests() {
    if (this.#abortController && !this.#abortController.signal.aborted) {
      this.#abortController.abort();
    }
  }
}

/**
 * Sleep for a specified amount of time.
 *
 * @param ms - The number of milliseconds to sleep.
 * @returns A promise that resolves after the specified amount of time.
 */
async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

/**
 * Execute a callback with a timeout and cancellation.
 *
 * @param callback - The callback to execute.
 * @param timeout - The timeout in milliseconds.
 * @param abortController - The abort controller.
 * @returns The result of the callback.
 */
async function withTimeoutAndCancellation<Type>(
  callback: () => Promise<Type>,
  timeout: number,
  abortController: AbortController,
): Promise<Type> {
  let timeoutId: NodeJS.Timeout | null = null;
  let abortHandler: (() => void) | null = null;
  const cleanupFn = () => {
    if (timeoutId) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }
    if (abortHandler) {
      // remove the abort handler since it is no longer needed
      abortController.signal.removeEventListener('abort', abortHandler);
      abortHandler = null;
    }
  };

  try {
    const timeOutPromise = new Promise((_resolve, reject) => {
      timeoutId = setTimeout(() => {
        reject(new Error('Timeout waiting for coverage result'));
      }, timeout);
    });

    const abortPromise = new Promise((_resolve, reject) => {
      abortHandler = () => {
        reject(new Error('Coverage result polling cancelled'));
      };
      abortController.signal.addEventListener('abort', abortHandler);
    });

    const result = await Promise.race([
      callback(),
      timeOutPromise,
      abortPromise,
    ]);
    cleanupFn();
    return result as Type;
  } catch (error) {
    cleanupFn();
    throw error;
  }
}
