import { createModuleLogger } from '@metamask/utils';

import { CLIENT_ID_HEADER } from '../../constants.js';
import type { TransactionPayClientId } from '../../constants.js';
import { projectLogger } from '../../logger.js';
import type { TransactionPayControllerMessenger } from '../../types.js';
import { getFeatureFlags } from '../../utils/feature-flags.js';
import { RELAY_STATUS_URL, RELAY_TRANSACTIONS_INDEX_URL } from './constants.js';
import type {
  RelayExecuteRequest,
  RelayExecuteResponse,
  RelayQuote,
  RelayQuoteRequest,
  RelaySolanaQuote,
  RelaySolanaQuoteRequest,
  RelayStatusResponse,
} from './types.js';

const log = createModuleLogger(projectLogger, 'relay-api');

/** Error thrown for a non-OK Relay API response. */
export class RelayApiError extends Error {
  /** Machine-readable Relay error code from the response body, if any. */
  readonly errorCode?: string;

  constructor(message: string, errorCode?: string) {
    super(message);
    this.errorCode = errorCode;
  }
}

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
 * Fetch an executable Solana quote through the Relay quote URL. Solana quotes
 * use the same MetaMask Relay proxy as EVM quotes, which passes the Solana
 * instructions and lookup tables through.
 *
 * @param messenger - Controller messenger.
 * @param body - Solana quote request.
 * @param signal - Optional abort signal.
 * @returns The validated-at-consumption quote response with its request attached.
 */
export async function fetchRelaySolanaQuote(
  messenger: TransactionPayControllerMessenger,
  body: RelaySolanaQuoteRequest,
  signal?: AbortSignal,
): Promise<RelaySolanaQuote> {
  const { relayQuoteUrl } = getFeatureFlags(messenger);
  const response = await relayFetch(messenger, relayQuoteUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  });
  const quote = (await response.json()) as RelaySolanaQuote;
  quote.request = body;
  return quote;
}

/**
 * Notifies Relay about a wallet-broadcast source transaction.
 *
 * This operation is deliberately separate from signing/broadcasting so it can
 * be retried without ever resubmitting the source transaction.
 *
 * @param messenger - Controller messenger.
 * @param request - Stable source transaction correlation.
 * @param request.chainId - Relay numeric source chain ID.
 * @param request.requestId - Relay request correlation ID.
 * @param request.txHash - Base58 source transaction signature.
 */
export async function notifyRelayTransaction(
  messenger: TransactionPayControllerMessenger,
  request: {
    chainId: string;
    requestId: string;
    txHash: string;
  },
): Promise<void> {
  await relayFetch(messenger, RELAY_TRANSACTIONS_INDEX_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  });
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
 * Fetch a Relay endpoint, throwing a `RelayApiError` containing the response
 * body's `message` or `error` field (or status code) on non-OK responses, so
 * the Relay server's actual reason is preserved without leaking the request
 * URL via the default `successfulFetch` message. The body's `errorCode` is
 * kept on the error.
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
    let errorCode: string | undefined;
    try {
      const body = (await response.json()) as {
        message?: string;
        error?: string;
        errorCode?: string;
      };
      detail = body.message ?? body.error;
      errorCode = body.errorCode;
    } catch {
      // Body wasn't JSON; fall through to status-only error.
    }
    throw new RelayApiError(
      detail ? `${response.status} - ${detail}` : String(response.status),
      errorCode,
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
