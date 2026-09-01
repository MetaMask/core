import { createModuleLogger } from '@metamask/utils';

import { projectLogger } from '../../logger.js';
import type { TransactionPayControllerMessenger } from '../../types.js';
import { getPayStrategiesConfig } from '../../utils/feature-flags.js';
import type {
  ServerProviderName,
  ServerQuoteRequest,
  ServerQuoteResponse,
  ServerStatusResponse,
  ServerSubmitRequest,
  ServerSubmitResponse,
} from './types.js';

const log = createModuleLogger(projectLogger, 'server-api');

/**
 * Fetch a quote from the server intents API.
 *
 * @param messenger - Controller messenger.
 * @param body - Quote request parameters.
 * @param signal - Optional abort signal that cancels the underlying fetch.
 * @returns The server quote response.
 */
export async function fetchServerQuote(
  messenger: TransactionPayControllerMessenger,
  body: ServerQuoteRequest,
  signal?: AbortSignal,
): Promise<ServerQuoteResponse> {
  const { server } = getPayStrategiesConfig(messenger);
  const quoteUrl = `${server.baseUrl}/quote`;

  log('Fetching quote', { url: quoteUrl });

  const response = await serverFetch(quoteUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  });

  return (await response.json()) as ServerQuoteResponse;
}

/**
 * Submit a gasless intent via the server intents API.
 *
 * @param messenger - Controller messenger.
 * @param body - Submit request parameters.
 * @returns The submit response.
 */
export async function submitServerIntent(
  messenger: TransactionPayControllerMessenger,
  body: ServerSubmitRequest,
): Promise<ServerSubmitResponse> {
  const { server } = getPayStrategiesConfig(messenger);
  const submitUrl = `${server.baseUrl}/submit`;

  log('Submitting intent', { url: submitUrl });

  const response = await serverFetch(submitUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  return (await response.json()) as ServerSubmitResponse;
}

/**
 * Fetch the status of a server intent.
 *
 * @param messenger - Controller messenger.
 * @param params - Status query parameters.
 * @param params.provider - The provider that the intent was submitted to.
 * @param params.id - The intent ID.
 * @param params.hash - Optional transaction hash to include in the status query.
 * @returns The current status of the intent.
 */
export async function getServerStatus(
  messenger: TransactionPayControllerMessenger,
  params: { provider: ServerProviderName; id: string; hash?: string },
): Promise<ServerStatusResponse> {
  const { server } = getPayStrategiesConfig(messenger);
  const query = new URLSearchParams({
    provider: params.provider,
    id: params.id,
  });
  if (params.hash) {
    query.set('hash', params.hash);
  }
  const url = `${server.baseUrl}/status?${query.toString()}`;

  log('Fetching status', { url });

  const response = await serverFetch(url, { method: 'GET' });

  return (await response.json()) as ServerStatusResponse;
}

/**
 * Fetch a server intents-api endpoint, throwing an error containing the
 * response body's `message` or `error` field (or status code) on non-OK
 * responses so the server's actual reason is preserved without leaking the
 * request URL.
 *
 * @param url - The endpoint to fetch.
 * @param init - Fetch init options.
 * @returns The successful response.
 */
async function serverFetch(url: string, init?: RequestInit): Promise<Response> {
  const response = await fetch(url, init);

  if (!response.ok) {
    let detail: string | undefined;
    try {
      const body = (await response.json()) as {
        message?: string;
        error?: string;
      };
      detail = body.message ?? body.error;
    } catch {
      // Body wasn't JSON; fall through to status-only error.
    }
    throw new Error(
      detail ? `${response.status} - ${detail}` : String(response.status),
    );
  }

  return response;
}
