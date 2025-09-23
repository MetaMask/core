import type { SignatureRequest } from '@metamask/signature-controller';
import type { TransactionMeta } from '@metamask/transaction-controller';

import type {
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
  status: CoverageStatus;
};

export class ShieldRemoteBackend implements ShieldBackend {
  readonly #getAccessToken: () => Promise<string>;

  readonly #getCoverageResultTimeout: number;

  readonly #getCoverageResultPollInterval: number;

  readonly #baseUrl: string;

  readonly #fetch: typeof globalThis.fetch;

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

  async checkCoverage(txMeta: TransactionMeta): Promise<CoverageResult> {
    const reqBody: InitCoverageCheckRequest = {
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

    const { coverageId } = await this.#initCoverageCheck(
      'v1/transaction/coverage/init',
      reqBody,
    );

    const coverageResult = await this.#getCoverageResult(coverageId);
    return { coverageId, status: coverageResult.status };
  }

  async checkSignatureCoverage(
    signatureRequest: SignatureRequest,
  ): Promise<CoverageResult> {
    if (typeof signatureRequest.messageParams.data !== 'string') {
      throw new Error('Signature data must be a string');
    }

    const reqBody: InitSignatureCoverageCheckRequest = {
      chainId: signatureRequest.chainId,
      data: signatureRequest.messageParams.data,
      from: signatureRequest.messageParams.from,
      method: signatureRequest.type,
      origin: signatureRequest.messageParams.origin,
    };

    const { coverageId } = await this.#initCoverageCheck(
      'v1/signature/coverage/init',
      reqBody,
    );

    const coverageResult = await this.#getCoverageResult(coverageId);
    return { coverageId, status: coverageResult.status };
  }

  async logSignature(req: LogSignatureRequest): Promise<void> {
    const res = await this.#fetch(
      `${this.#baseUrl}/v1/signature/coverage/log`,
      {
        method: 'POST',
        headers: await this.#createHeaders(),
        body: JSON.stringify(req),
      },
    );
    if (res.status !== 200) {
      throw new Error(`Failed to log signature: ${res.status}`);
    }
  }

  async logTransaction(req: LogTransactionRequest): Promise<void> {
    const res = await this.#fetch(
      `${this.#baseUrl}/v1/transaction/coverage/log`,
      {
        method: 'POST',
        headers: await this.#createHeaders(),
        body: JSON.stringify(req),
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
    timeout: number = this.#getCoverageResultTimeout,
    pollInterval: number = this.#getCoverageResultPollInterval,
  ): Promise<GetCoverageResultResponse> {
    const reqBody: GetCoverageResultRequest = {
      coverageId,
    };

    const headers = await this.#createHeaders();
    return await new Promise((resolve, reject) => {
      let timeoutReached = false;
      setTimeout(() => {
        timeoutReached = true;
        reject(new Error('Timeout waiting for coverage result'));
      }, timeout);

      const poll = async (): Promise<GetCoverageResultResponse> => {
        // The timeoutReached variable is modified in the timeout callback.
        // eslint-disable-next-line no-unmodified-loop-condition
        while (!timeoutReached) {
          const startTime = Date.now();
          const res = await this.#fetch(
            `${this.#baseUrl}/v1/transaction/coverage/result`,
            {
              method: 'POST',
              headers,
              body: JSON.stringify(reqBody),
            },
          );
          if (res.status === 200) {
            return (await res.json()) as GetCoverageResultResponse;
          }
          await sleep(pollInterval - (Date.now() - startTime));
        }
        // The following line will not have an effect as the upper level promise
        // will already be rejected by now.
        throw new Error('unexpected error');
      };

      poll().then(resolve).catch(reject);
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
 * Sleep for a specified amount of time.
 *
 * @param ms - The number of milliseconds to sleep.
 * @returns A promise that resolves after the specified amount of time.
 */
async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
