import { createModuleLogger } from '@metamask/utils';

import { CLIENT_ID_HEADER } from '../../constants.js';
import type { TransactionPayClientId } from '../../constants.js';
import { projectLogger } from '../../logger.js';
import type { TransactionPayControllerMessenger } from '../../types.js';
import { getPayStrategiesConfig } from '../../utils/feature-flags.js';
import type {
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

  const response = await serverFetch(messenger, quoteUrl, {
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

  const response = await serverFetch(messenger, submitUrl, {
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
  params: { provider: string; id: string; hash?: string },
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

  const response = await serverFetch(messenger, url, { method: 'GET' });

  return (await response.json()) as ServerStatusResponse;
}

/**
 * Fetch a server intents-api endpoint, throwing an error containing the
 * response body's `message` or `error` field (or status code) on non-OK
 * responses so the server's actual reason is preserved without leaking the
 * request URL.
 *
 * Adds the `X-Client-Id` header so the intents API can distinguish Mobile
 * from Extension traffic.
 *
 * @param messenger - Controller messenger.
 * @param url - The endpoint to fetch.
 * @param init - Fetch init options.
 * @returns The successful response.
 */
async function serverFetch(
  messenger: TransactionPayControllerMessenger,
  url: string,
  init?: RequestInit,
): Promise<Response> {
  const clientId = getClientId(messenger);

  const headers = clientId
    ? { ...init?.headers, [CLIENT_ID_HEADER]: clientId }
    : init?.headers;

  const response = await fetch(url, { ...init, ...(headers && { headers }) });

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

/**
 * Retrieve the client identifier from the controller.
 *
 * Returns `undefined` if the client did not configure one, so requests are
 * still made without the header rather than failing.
 *
 * @param messenger - Controller messenger.
 * @returns The client identifier, if configured.
 */
function getClientId(
  messenger: TransactionPayControllerMessenger,
): TransactionPayClientId | undefined {
  try {
    return messenger.call('TransactionPayController:getClientId');
  } catch (error) {
    log('Failed to retrieve client ID', error);
    return undefined;
  }
}
