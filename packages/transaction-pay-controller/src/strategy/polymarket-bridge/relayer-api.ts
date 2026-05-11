import { createModuleLogger } from '@metamask/utils';

import { projectLogger } from '../../logger';
import { RELAYER_TERMINAL_STATES } from './constants';
import type {
  PolymarketBridgeRelayerStatusResponse,
  PolymarketBridgeRelayerSubmitRequest,
  PolymarketBridgeRelayerSubmitResponse,
  PolymarketRelayerProxyEnvelope,
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
    log('Fetching nonce', { address, type });

    const result = await this.#postEnvelope<{ nonce: string }>({
      path: '/nonce',
      method: 'GET',
      query: { address, type },
    });

    log('Nonce received', { nonce: result.nonce });

    return result.nonce;
  }

  async submit(
    request: PolymarketBridgeRelayerSubmitRequest,
  ): Promise<PolymarketBridgeRelayerSubmitResponse> {
    log('Submitting transaction', { from: request.from, to: request.to });

    const result =
      await this.#postEnvelope<PolymarketBridgeRelayerSubmitResponse>({
        path: '/submit',
        method: 'POST',
        body: request,
      });

    log('Transaction submitted', {
      transactionID: result.transactionID,
      state: result.state,
    });

    return result;
  }

  async getTransaction(
    transactionId: string,
  ): Promise<PolymarketBridgeRelayerStatusResponse[]> {
    const result = await this.#postEnvelope<
      | PolymarketBridgeRelayerStatusResponse
      | PolymarketBridgeRelayerStatusResponse[]
    >({
      path: '/transaction',
      method: 'GET',
      query: { id: transactionId },
    });

    return Array.isArray(result) ? result : [result];
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

  async #postEnvelope<TResponse>(
    envelope: PolymarketRelayerProxyEnvelope,
  ): Promise<TResponse> {
    const url = `${this.#baseUrl}/transaction`;

    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(envelope),
      });
    } catch (error) {
      throw new PolymarketRelayerError(
        `Relayer proxy request failed: ${String(error)}`,
        'REQUEST_FAILED',
        error,
      );
    }

    const text = await response.text();

    let parsed: unknown;
    if (text) {
      try {
        parsed = JSON.parse(text);
      } catch (error) {
        if (!response.ok) {
          throw new PolymarketRelayerError(
            `Relayer proxy returned ${response.status} with non-JSON body`,
            'HTTP_ERROR',
            error,
          );
        }
        throw new PolymarketRelayerError(
          'Relayer proxy returned malformed JSON',
          'MALFORMED_JSON',
          error,
        );
      }
    }

    if (!response.ok) {
      const detail =
        typeof parsed === 'object' && parsed !== null
          ? (parsed as { error?: string; message?: string }).error ??
            (parsed as { error?: string; message?: string }).message
          : undefined;

      throw new PolymarketRelayerError(
        detail ?? `Relayer proxy returned status ${response.status}`,
        'PROXY_ERROR',
        parsed,
      );
    }

    if (parsed === undefined) {
      throw new PolymarketRelayerError(
        'Relayer proxy returned an empty response',
        'EMPTY_RESPONSE',
      );
    }

    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      'error' in parsed &&
      typeof (parsed as { error: unknown }).error === 'string'
    ) {
      throw new PolymarketRelayerError(
        (parsed as { error: string }).error,
        'PROXY_ERROR',
      );
    }

    return parsed as TResponse;
  }
}

function isTerminalState(state: PolymarketRelayerState): boolean {
  return (RELAYER_TERMINAL_STATES as readonly string[]).includes(state);
}

async function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
