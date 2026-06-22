import { getClientHeaders } from '@metamask/bridge-controller';

import { BridgeClientId, BridgeStatusControllerMessenger } from '../types';
import { getJwt } from '../utils/authentication';
import {
  QuoteStatusUpdateBackendStatus,
  QuoteStatusUpdateRetryableBackendTypes,
  QuoteStatusUpdateWithRetryOutcomeType,
} from './constants';
import { QuoteStatusUpdateError } from './errors';
import { QuoteStatusUpdateWithRetryOutcome } from './quote-status-update-with-retry-outcome';
import {
  QuoteStatusApiServiceOptions,
  QuoteStatusUpdateResponse,
} from './types';
import { sleep } from './utils';
import { validateQuoteStatusUpdateResponse } from './validators';

/**
 * Service responsible for calling bridge quote status update APIs.
 *
 * It performs authentication, sends properly-scoped client headers, and validates
 * error responses so callers can handle known update-status failures.
 */
export class QuoteStatusApiService {
  readonly #messenger: BridgeStatusControllerMessenger;

  readonly #clientId: BridgeClientId;

  readonly #clientProduct: string;

  readonly #clientVersion: string | undefined;

  readonly #apiBaseUrl: string;

  readonly #onError: ((error: QuoteStatusUpdateError) => void) | undefined;

  /**
   * Creates an API service for quote status update requests.
   *
   * @param options - Service dependencies and request configuration.
   * @param options.messenger - Messenger used to retrieve the authentication token.
   * @param options.clientId - Bridge client identifier used for request headers.
   * @param options.clientProduct - Product name sent in client product headers.
   * @param options.clientVersion - Optional client version sent in headers.
   * @param options.apiBaseUrl - Base URL for the quote status API.
   * @param options.onError - Optional callback for unexpected response-shape errors.
   */
  constructor({
    messenger,
    clientId,
    clientProduct,
    clientVersion,
    apiBaseUrl,
    onError,
  }: QuoteStatusApiServiceOptions) {
    this.#messenger = messenger;
    this.#clientId = clientId;
    this.#clientProduct = clientProduct;
    this.#clientVersion = clientVersion;
    this.#apiBaseUrl = apiBaseUrl;
    this.#onError = onError;
  }

  /**
   * Updates a quote status in the bridge quote-status API.
   *
   * The endpoint returns no payload on success (`2xx`) and a structured payload
   * on non-`2xx` responses. This method returns `null` for successful updates and
   * the validated error payload for unsuccessful updates.
   *
   * @param data - Request payload identifying quote and target status transition.
   * @param data.quoteId - Unique quote identifier to update.
   * @param data.srcTxHash - Source transaction hash associated with the quote.
   * @param data.newStatus - Target quote status to persist.
   * @param signal - Optional abort signal for canceling the request.
   * @returns `null` for `2xx` responses, or a validated error response for non-`2xx`.
   * @throws If the non-`2xx` response body does not match the expected schema.
   */
  async updateQuoteStatus(
    data: {
      quoteId: string;
      srcTxHash: string;
      newStatus: QuoteStatusUpdateBackendStatus;
    },
    signal?: AbortSignal,
  ): Promise<QuoteStatusUpdateResponse | null> {
    const jwt = await getJwt(this.#messenger);

    // This method uses `globalThis.fetch` and reads the raw
    // `Response` (including JSON on non-2xx). Wrappers like `handleFetch` that
    // throw on non-2xx would prevent typed error handling in callers.
    const res = await globalThis.fetch(
      `${this.#apiBaseUrl}/quote/updateStatus`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-metamask-clientproduct': this.#clientProduct,
          ...(this.#clientVersion
            ? { 'x-metamask-clientversion': this.#clientVersion }
            : {}),
          ...getClientHeaders({
            clientId: this.#clientId,
            jwt,
          }),
        },
        body: JSON.stringify(data),
        signal,
      },
    );

    if (res.ok) {
      return null;
    }

    const responseData = await res.json();

    try {
      validateQuoteStatusUpdateResponse(responseData);
      return responseData;
    } catch (error) {
      this.#onError?.(
        new QuoteStatusUpdateError(
          'unexpected response shape from quote/updateStatus',
          { quoteId: data.quoteId },
        ),
      );
      throw error;
    }
  }

  /**
   * Updates a quote status, retrying on transient backend failures.
   *
   * Wraps {@link updateQuoteStatus} in a bounded retry loop. A request is only
   * retried when the backend returns an error whose type is in
   * {@link QuoteStatusUpdateRetryableBackendTypes}; any other error response
   * resolves immediately as non-retryable. Retries are spaced by
   * `options.delayMsBetweenRetries`, and the abort signal is checked before each
   * attempt so an in-flight or pending retry can be cancelled.
   *
   * @param data - Request payload identifying the quote and target transition.
   * @param data.quoteId - Unique quote identifier to update.
   * @param data.srcTxHash - Source transaction hash associated with the quote.
   * @param data.newStatus - Target quote status to persist.
   * @param options - Retry configuration.
   * @param options.maxRetries - Maximum number of retries after the initial attempt.
   * @param options.delayMsBetweenRetries - Delay in milliseconds between attempts.
   * @param signal - Optional abort signal for canceling the request and its retries.
   * @returns An outcome describing how the update resolved:
   * `Accepted` when the backend accepted the update, `NonRetryable` for a
   * non-retryable error response, `Interrupted` when aborted, or
   * `RetryableExhausted` when all retries were used up on retryable errors.
   * @throws If a request rejects for a reason other than the abort signal (e.g.
   * an unexpected response shape from {@link updateQuoteStatus}).
   */
  async updateQuoteStatusWithRetry(
    data: {
      quoteId: string;
      srcTxHash: string;
      newStatus: QuoteStatusUpdateBackendStatus;
    },
    options: {
      maxRetries: number;
      delayMsBetweenRetries: number;
    },
    signal?: AbortSignal,
  ): Promise<QuoteStatusUpdateWithRetryOutcome> {
    for (let attempt = 0; attempt <= options.maxRetries; attempt += 1) {
      if (attempt > 0) {
        await sleep(options.delayMsBetweenRetries);
      }

      if (signal?.aborted) {
        return new QuoteStatusUpdateWithRetryOutcome(
          QuoteStatusUpdateWithRetryOutcomeType.Interrupted,
        );
      }

      try {
        const response = await this.updateQuoteStatus(data, signal);

        if (response === null) {
          return new QuoteStatusUpdateWithRetryOutcome(
            QuoteStatusUpdateWithRetryOutcomeType.Accepted,
          );
        }

        if (!QuoteStatusUpdateRetryableBackendTypes.includes(response.type)) {
          return new QuoteStatusUpdateWithRetryOutcome(
            QuoteStatusUpdateWithRetryOutcomeType.NonRetryable,
            response,
          );
        }
      } catch (error) {
        if (signal?.aborted) {
          return new QuoteStatusUpdateWithRetryOutcome(
            QuoteStatusUpdateWithRetryOutcomeType.Interrupted,
          );
        }

        throw error;
      }
    }

    return new QuoteStatusUpdateWithRetryOutcome(
      QuoteStatusUpdateWithRetryOutcomeType.RetryableExhausted,
    );
  }
}
