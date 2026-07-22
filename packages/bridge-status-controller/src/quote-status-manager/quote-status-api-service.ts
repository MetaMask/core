import { getClientHeaders } from '@metamask/bridge-controller';
import { StructError } from '@metamask/superstruct';

import { BridgeClientId, BridgeStatusControllerMessenger } from '../types';
import { getJwt } from '../utils/authentication';
import {
  QuoteStatusBackendStatus,
  QuoteStatusUpdateRetryableBackendTypes,
  QuoteStatusFetchWithRetryOutcomeType,
} from './constants';
import { QuoteStatusGetError, QuoteStatusUpdateError } from './errors';
import { QuoteStatusGetWithRetryOutcome } from './quote-status-get-with-retry-outcome';
import { QuoteStatusUpdateWithRetryOutcome } from './quote-status-update-with-retry-outcome';
import {
  QuoteStatusApiServiceOptions,
  QuoteStatusGetResponse,
  QuoteStatusUpdateResponse,
} from './types';
import { sleep } from './utils';
import {
  validateQuoteStatusGetResponse,
  validateQuoteStatusUpdateResponse,
} from './validators';

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
      newStatus: QuoteStatusBackendStatus;
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
          { quoteId: data.quoteId, srcTxHash: data.srcTxHash },
        ),
      );
      throw error;
    }
  }

  async getQuoteStatus(
    data: {
      quoteId: string;
    },
    signal?: AbortSignal,
  ): Promise<QuoteStatusGetResponse> {
    const jwt = await getJwt(this.#messenger);

    // This method uses `globalThis.fetch` and reads the raw
    // `Response` (including JSON on non-2xx). Wrappers like `handleFetch` that
    // throw on non-2xx would prevent typed error handling in callers.
    const res = await globalThis.fetch(
      `${this.#apiBaseUrl}/getQuoteStatus?quoteId=${data.quoteId}`,
      {
        method: 'GET',
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
        signal,
      },
    );

    if (!res.ok) {
      // 5xx errors are transient (server-side); 4xx errors are client-side and
      // non-retryable. The `retryable` flag lets `getQuoteStatusWithRetry`
      // distinguish the two and only exit early for permanent failures.
      const retryable = res.status >= 500;
      const error = new QuoteStatusGetError(
        `request error to getQuoteStatus [${res.status}: ${res.statusText}]`,
        { quoteId: data.quoteId },
        retryable,
      );
      this.#onError?.(error);
      throw error;
    }

    const responseData = await res.json();

    try {
      validateQuoteStatusGetResponse(responseData);
      return responseData;
    } catch (error) {
      if (error instanceof StructError) {
        const validationFailures = [];

        for (const { path } of error.failures()) {
          const aggregatorId =
            (responseData as QuoteStatusGetResponse)?.submittedTx?.bridge ??
            ('unknown' as string);
          const pathString = path?.join('.') || 'unknown';
          validationFailures.push([aggregatorId, pathString].join('|'));
        }

        const validationError = new QuoteStatusGetError(
          'unexpected response shape from getQuoteStatus',
          { quoteId: data.quoteId, validationFailures },
        );

        this.#onError?.(validationError);

        throw validationError;
      }

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
   * `options.delayMsBetweenRetries`, and both the abort signal and the optional
   * `options.retry` predicate are checked before each attempt so an
   * in-flight or pending retry can be cancelled (e.g. when the entry's status
   * changed while sleeping between retries).
   *
   * @param data - Request payload identifying the quote and target transition.
   * @param data.quoteId - Unique quote identifier to update.
   * @param data.srcTxHash - Source transaction hash associated with the quote.
   * @param data.newStatus - Target quote status to persist.
   * @param options - Retry configuration.
   * @param options.maxRetries - Maximum number of retries after the initial attempt.
   * @param options.delayMsBetweenRetries - Delay in milliseconds between attempts.
   * @param options.retry - Optional predicate checked before each attempt;
   * when it returns `false` the loop stops early and resolves as `Interrupted`.
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
      newStatus: QuoteStatusBackendStatus;
    },
    options: {
      maxRetries: number;
      delayMsBetweenRetries: number;
      retry?: () => boolean;
    },
    signal?: AbortSignal,
  ): Promise<QuoteStatusUpdateWithRetryOutcome> {
    for (let attempt = 0; attempt <= options.maxRetries; attempt += 1) {
      if (attempt > 0) {
        await sleep(options.delayMsBetweenRetries);
      }

      if (signal?.aborted || options.retry?.() === false) {
        return new QuoteStatusUpdateWithRetryOutcome(
          QuoteStatusFetchWithRetryOutcomeType.Interrupted,
        );
      }

      try {
        const response = await this.updateQuoteStatus(data, signal);

        if (response === null) {
          return new QuoteStatusUpdateWithRetryOutcome(
            QuoteStatusFetchWithRetryOutcomeType.Accepted,
          );
        }

        if (!QuoteStatusUpdateRetryableBackendTypes.includes(response.type)) {
          return new QuoteStatusUpdateWithRetryOutcome(
            QuoteStatusFetchWithRetryOutcomeType.NonRetryable,
            response,
          );
        }
      } catch (error) {
        if (signal?.aborted) {
          return new QuoteStatusUpdateWithRetryOutcome(
            QuoteStatusFetchWithRetryOutcomeType.Interrupted,
          );
        }

        throw error;
      }
    }

    return new QuoteStatusUpdateWithRetryOutcome(
      QuoteStatusFetchWithRetryOutcomeType.RetryableExhausted,
    );
  }

  async getQuoteStatusWithRetry(
    data: {
      quoteId: string;
    },
    options: {
      maxRetries: number;
      delayMsBetweenRetries: number;
    },
    signal?: AbortSignal,
  ): Promise<QuoteStatusGetWithRetryOutcome> {
    for (let attempt = 0; attempt <= options.maxRetries; attempt += 1) {
      if (attempt > 0) {
        await sleep(options.delayMsBetweenRetries);
      }

      if (signal?.aborted) {
        return new QuoteStatusGetWithRetryOutcome(
          QuoteStatusFetchWithRetryOutcomeType.Interrupted,
        );
      }

      try {
        const response = await this.getQuoteStatus(data, signal);

        return new QuoteStatusGetWithRetryOutcome(
          QuoteStatusFetchWithRetryOutcomeType.Accepted,
          response,
        );
      } catch (error) {
        if (signal?.aborted) {
          return new QuoteStatusGetWithRetryOutcome(
            QuoteStatusFetchWithRetryOutcomeType.Interrupted,
          );
        }

        // Only short-circuit for non-retryable errors (e.g. 4xx, validation
        // failures). Retryable errors (e.g. 5xx) fall through so the loop can
        // attempt the next retry instead of returning NonRetryable immediately.
        if (error instanceof QuoteStatusGetError && !error.retryable) {
          return new QuoteStatusGetWithRetryOutcome(
            QuoteStatusFetchWithRetryOutcomeType.NonRetryable,
            undefined,
            error,
          );
        }
      }
    }

    return new QuoteStatusGetWithRetryOutcome(
      QuoteStatusFetchWithRetryOutcomeType.RetryableExhausted,
    );
  }
}
