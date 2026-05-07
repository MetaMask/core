// eslint-disable-next-line import-x/no-nodejs-modules
import { createHmac } from 'crypto';

import { successfulFetch } from '@metamask/controller-utils';
import { createModuleLogger } from '@metamask/utils';

import { projectLogger } from '../../logger';
import {
  POLYMARKET_RELAYER_BASE_URL_PREPROD,
  POLYMARKET_RELAYER_BASE_URL_PROD,
  RELAYER_TERMINAL_STATES,
} from './constants';
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

export type RelayerApiKeyCredentials = {
  type: 'relayer-api-key';
  apiKey: string;
};

export type BuilderCredentials = {
  type: 'builder';
  apiKey: string;
  secret: string;
  passphrase: string;
};

export type RelayerCredentials = RelayerApiKeyCredentials | BuilderCredentials;

export class PolymarketRelayerApi {
  readonly #baseUrl: string;

  readonly #creds: RelayerCredentials;

  constructor(environment: 'prod' | 'preprod', creds: RelayerCredentials) {
    this.#baseUrl =
      environment === 'prod'
        ? POLYMARKET_RELAYER_BASE_URL_PROD
        : POLYMARKET_RELAYER_BASE_URL_PREPROD;
    this.#creds = creds;
  }

  async getNonce(address: string, type: 'WALLET'): Promise<string> {
    const path = `/nonce?address=${address}&type=${type}`;
    const url = `${this.#baseUrl}${path}`;

    log('Fetching nonce', { address, type });

    const response = await relayerFetch(url, {
      method: 'GET',
      headers: {
        ...this.#authHeaders('GET', path, ''),
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
        ...this.#authHeaders('POST', path, body, request.from),
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
        ...this.#authHeaders('GET', path, ''),
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

  #authHeaders(
    method: string,
    path: string,
    body: string,
    fromAddress?: string,
  ): Record<string, string> {
    if (this.#creds.type === 'relayer-api-key') {
      if (!fromAddress) {
        return {};
      }

      return {
        RELAYER_API_KEY: this.#creds.apiKey,
        RELAYER_API_KEY_ADDRESS: fromAddress,
      };
    }

    const timestamp = Math.floor(Date.now() / 1000).toString();
    const canonical = timestamp + method.toUpperCase() + path + body;
    const signature = createHmac('sha256', this.#creds.secret)
      .update(canonical)
      .digest('base64');

    return {
      'POLY-BUILDER-API-KEY': this.#creds.apiKey,
      'POLY-BUILDER-TIMESTAMP': timestamp,
      'POLY-BUILDER-PASSPHRASE': this.#creds.passphrase,
      'POLY-BUILDER-SIGNATURE': signature,
    };
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
