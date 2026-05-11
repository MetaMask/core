import { successfulFetch } from '@metamask/controller-utils';
import { createModuleLogger } from '@metamask/utils';

import { projectLogger } from '../../logger';
import { RELAYER_TERMINAL_STATES } from './constants';
import type {
  PolymarketBridgeRelayerStatusResponse,
  PolymarketBridgeRelayerSubmitRequest,
  PolymarketBridgeRelayerSubmitResponse,
  PolymarketRelayerState,
} from './types';

const log = createModuleLogger(projectLogger, 'polymarket-relayer-api');

const POLLING_INTERVAL_MS = 2000;
const POLLING_MAX_ATTEMPTS = 90;

export class PolymarketRelayerError extends Error {
  code: string;

  raw: unknown;

  constructor(message: string, code: string, raw?: unknown) {
    super(message);
    this.name = 'PolymarketRelayerError';
    this.code = code;
    this.raw = raw;
  }
}

export class PolymarketRelayerApi {
  readonly #baseUrl: string;

  constructor(baseUrl: string) {
    this.#baseUrl = baseUrl;
  }

  async getNonce(address: string, type: 'WALLET'): Promise<string> {
    const path = `/nonce?address=${address}&type=${type}`;
    const url = `${this.#baseUrl}${path}`;

    log('Fetching nonce', { address, type });

    const response = await relayerFetch(url, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
      },
    });

    const result = (await response.json()) as { nonce: string };

    log('Nonce received', { nonce: result.nonce });

    return result.nonce;
  }

  async submit(
    request: PolymarketBridgeRelayerSubmitRequest,
  ): Promise<PolymarketBridgeRelayerSubmitResponse> {
    const path = '/submit';
    const body = JSON.stringify(request);
    const url = `${this.#baseUrl}${path}`;

    log('Submitting transaction', { from: request.from, to: request.to });

    const response = await relayerFetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body,
    });

    const result =
      (await response.json()) as PolymarketBridgeRelayerSubmitResponse;

    log('Transaction submitted', {
      transactionID: result.transactionID,
      state: result.state,
    });

    return result;
  }

  async getTransaction(
    transactionId: string,
  ): Promise<PolymarketBridgeRelayerStatusResponse[]> {
    const path = `/transaction?id=${transactionId}`;
    const url = `${this.#baseUrl}${path}`;

    const response = await relayerFetch(url, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
      },
    });

    return (await response.json()) as PolymarketBridgeRelayerStatusResponse[];
  }

  async pollUntilTerminal(
    transactionId: string,
  ): Promise<PolymarketBridgeRelayerStatusResponse> {
    log('Starting polling', { transactionId });

    for (let attempt = 0; attempt < POLLING_MAX_ATTEMPTS; attempt++) {
      await delay(POLLING_INTERVAL_MS);

      const statuses = await this.getTransaction(transactionId);
      const latest = statuses[0];

      if (latest && isTerminalState(latest.state)) {
        log('Reached terminal state', {
          transactionId,
          state: latest.state,
          attempt: attempt + 1,
        });
        return latest;
      }

      log('Polling attempt', {
        transactionId,
        state: latest?.state,
        attempt: attempt + 1,
      });
    }

    throw new PolymarketRelayerError(
      `Polling timed out after ${POLLING_MAX_ATTEMPTS} attempts`,
      'POLLING_TIMEOUT',
    );
  }
}

async function relayerFetch(
  url: string,
  init?: RequestInit,
): Promise<Response> {
  try {
    return await successfulFetch(url, init);
  } catch (error) {
    throw new PolymarketRelayerError(
      `Relayer request failed: ${String(error)}`,
      'REQUEST_FAILED',
      error,
    );
  }
}

function isTerminalState(state: PolymarketRelayerState): boolean {
  return (RELAYER_TERMINAL_STATES as readonly string[]).includes(state);
}

async function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
