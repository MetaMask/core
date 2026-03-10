import { successfulFetch } from '@metamask/controller-utils';

import { RELAY_STATUS_URL } from './constants';
import type {
  RelayExecuteRequest,
  RelayExecuteResponse,
  RelayQuote,
  RelayQuoteRequest,
  RelayStatusResponse,
} from './types';
import type { TransactionPayControllerMessenger } from '../../types';
import { getFeatureFlags } from '../../utils/feature-flags';

/**
 * Fetch a quote from the Relay API.
 *
 * @param messenger - Controller messenger.
 * @param body - Quote request parameters.
 * @returns The Relay quote with the request attached.
 */
export async function fetchRelayQuote(
  messenger: TransactionPayControllerMessenger,
  body: RelayQuoteRequest,
): Promise<RelayQuote> {
  const { relayQuoteUrl } = getFeatureFlags(messenger);

  const response = await successfulFetch(relayQuoteUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
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

  const response = await successfulFetch(relayExecuteUrl, {
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

  const response = await successfulFetch(url, { method: 'GET' });

  return (await response.json()) as RelayStatusResponse;
}
