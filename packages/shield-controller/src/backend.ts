import type { TransactionMeta } from '@metamask/transaction-controller';

import type { CoverageResult, CoverageStatus, ShieldBackend } from './types';

export const BASE_URL = 'https://rule-engine.metamask.io';

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

  constructor({
    getAccessToken,
    getCoverageResultTimeout = 5000, // milliseconds
    getCoverageResultPollInterval = 1000, // milliseconds
  }: {
    getAccessToken: () => Promise<string>;
    getCoverageResultTimeout?: number;
    getCoverageResultPollInterval?: number;
  }) {
    this.#getAccessToken = getAccessToken;
    this.#getCoverageResultTimeout = getCoverageResultTimeout;
    this.#getCoverageResultPollInterval = getCoverageResultPollInterval;
  }

  checkCoverage: (txMeta: TransactionMeta) => Promise<CoverageResult> = async (
    txMeta,
  ) => {
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

    const { coverageId } = await this.#initCoverageCheck(reqBody);

    return this.#getCoverageResult(coverageId);
  };

  async #initCoverageCheck(
    reqBody: InitCoverageCheckRequest,
  ): Promise<InitCoverageCheckResponse> {
    const res = await fetch(`${BASE_URL}/api/v1/coverage/init`, {
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
  ) {
    const reqBody: GetCoverageResultRequest = {
      coverageId,
    };

    const startTime = Date.now();
    while (Date.now() - startTime < timeout) {
      const res = await fetch(`${BASE_URL}/api/v1/coverage/result`, {
        method: 'POST',
        headers: await this.#createHeaders(),
        body: JSON.stringify(reqBody),
      });
      if (res.status === 200) {
        return (await res.json()) as GetCoverageResultResponse;
      }
      await new Promise((resolve) => setTimeout(resolve, pollInterval));
    }
    throw new Error('Timeout waiting for coverage result');
  }

  async #createHeaders() {
    const accessToken = await this.#getAccessToken();
    return {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    };
  }
}
