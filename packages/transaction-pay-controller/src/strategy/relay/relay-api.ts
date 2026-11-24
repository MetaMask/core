import { createModuleLogger } from '@metamask/utils';

import { CLIENT_ID_HEADER } from '../../constants.js';
import type { TransactionPayClientId } from '../../constants.js';
import { projectLogger } from '../../logger.js';
import type { TransactionPayControllerMessenger } from '../../types.js';
import { getFeatureFlags } from '../../utils/feature-flags.js';
import { RELAY_STATUS_URL } from './constants.js';
import type {
  RelayExecuteRequest,
  RelayExecuteResponse,
  RelayQuote,
  RelayQuoteRequest,
  RelayStatusResponse,
} from './types.js';

const log = createModuleLogger(projectLogger, 'relay-api');

/**
 * Fetch a quote from the Relay API.
 *
 * @param messenger - Controller messenger.
 * @param body - Quote request parameters.
 * @param signal - Optional abort signal that cancels the underlying fetch.
 * @returns The Relay quote with the request attached.
 */
export async function fetchRelayQuote(
  messenger: TransactionPayControllerMessenger,
  body: RelayQuoteRequest,
  signal?: AbortSignal,
): Promise<RelayQuote> {
  const { relayQuoteUrl } = getFeatureFlags(messenger);

  const response = await relayFetch(messenger, relayQuoteUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  });

  const quote = (await response.json()) as RelayQuote;
  quote.request = body;

  return quote;
}

/**
 * Submit a gasless transaction via the Relay /execute endpoint.
 *
 * @param messenger - Controller messenger.
 * @param body - Execute request parameters.
 * @returns The execute response containing the request ID.
 */
export async function submitRelayExecute(
  messenger: TransactionPayControllerMessenger,
  body: RelayExecuteRequest,
): Promise<RelayExecuteResponse> {
  const { relayExecuteUrl } = getFeatureFlags(messenger);

  const response = await relayFetch(messenger, relayExecuteUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  return (await response.json()) as RelayExecuteResponse;
}

/**
 * Poll the Relay status endpoint for a given request ID.
 *
 * @param messenger - Controller messenger.
 * @param requestId - The Relay request ID to check.
 * @returns The current status of the request.
 */
export async function getRelayStatus(
  messenger: TransactionPayControllerMessenger,
  requestId: string,
): Promise<RelayStatusResponse> {
  const url = `${RELAY_STATUS_URL}?requestId=${requestId}`;

  const response = await relayFetch(messenger, url, { method: 'GET' });

  return (await response.json()) as RelayStatusResponse;
}

/**
 * Fetch a Relay endpoint, throwing an error containing the response body's
 * `message` or `error` field (or status code) on non-OK responses, so the
 * Relay server's actual reason is preserved without leaking the request URL
 * via the default `successfulFetch` message.
 *
 * @param messenger - Controller messenger.
 * @param url - The Relay endpoint to fetch.
 * @param init - Fetch init options.
 * @returns The successful response.
 */
async function relayFetch(
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
