import type { TransactionPayControllerMessenger } from '../../types';
import { getFeatureFlags } from '../../utils/feature-flags';
import { RELAY_STATUS_URL } from './constants';
import type {
  RelayExecuteRequest,
  RelayExecuteResponse,
  RelayQuote,
  RelayQuoteRequest,
  RelayStatusResponse,
} from './types';

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

  const response = await relayFetch(relayQuoteUrl, {
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

  const response = await relayFetch(relayExecuteUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  return (await response.json()) as RelayExecuteResponse;
}

/**
 * Poll the Relay status endpoint for a given request ID.
 *
 * @param requestId - The Relay request ID to check.
 * @returns The current status of the request.
 */
export async function getRelayStatus(
  requestId: string,
): Promise<RelayStatusResponse> {
  const url = `${RELAY_STATUS_URL}?requestId=${requestId}`;

  const response = await relayFetch(url, { method: 'GET' });

  return (await response.json()) as RelayStatusResponse;
}

/**
 * Fetch a Relay endpoint, throwing an error containing the response body's
 * `message` or `error` field (or status code) on non-OK responses, so the
 * Relay server's actual reason is preserved without leaking the request URL
 * via the default `successfulFetch` message.
 *
 * @param url - The Relay endpoint to fetch.
 * @param init - Fetch init options.
 * @returns The successful response.
 */
async function relayFetch(url: string, init?: RequestInit): Promise<Response> {
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
