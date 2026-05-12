import type { Hex } from '@metamask/utils';
import { createModuleLogger } from '@metamask/utils';

import { projectLogger } from '../../../logger';
import type { TransactionPayControllerMessenger } from '../../../types';
import { getPolymarketRelayerUrl } from '../../../utils/feature-flags';
import type {
  PolymarketRelayerProxyEnvelope,
  PolymarketRelayerStatusResponse,
  PolymarketRelayerSubmitRequest,
  PolymarketRelayerSubmitResponse,
} from './types';

const log = createModuleLogger(projectLogger, 'polymarket-relayer-api');

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

export async function getNonce(
  messenger: TransactionPayControllerMessenger,
  address: Hex,
): Promise<string> {
  const result = await postEnvelope<{ nonce: string }>(messenger, {
    path: '/nonce',
    method: 'GET',
    query: { address, type: 'WALLET' },
  });

  log('Nonce received', { address, nonce: result.nonce });
  return result.nonce;
}

export async function submitRelayerRequest(
  messenger: TransactionPayControllerMessenger,
  request: PolymarketRelayerSubmitRequest,
): Promise<PolymarketRelayerSubmitResponse> {
  const response = await postEnvelope<PolymarketRelayerSubmitResponse>(
    messenger,
    { path: '/submit', method: 'POST', body: request },
  );

  log('Relayer accepted submission', {
    transactionID: response.transactionID,
    state: response.state,
  });

  return response;
}

export async function getTransactionStatus(
  messenger: TransactionPayControllerMessenger,
  transactionId: string,
): Promise<PolymarketRelayerStatusResponse[]> {
  const result = await postEnvelope<
    PolymarketRelayerStatusResponse | PolymarketRelayerStatusResponse[]
  >(messenger, {
    path: '/transaction',
    method: 'GET',
    query: { id: transactionId },
  });

  return Array.isArray(result) ? result : [result];
}

async function postEnvelope<TResponse>(
  messenger: TransactionPayControllerMessenger,
  envelope: PolymarketRelayerProxyEnvelope,
): Promise<TResponse> {
  const url = `${getPolymarketRelayerUrl(messenger)}/transaction`;

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
