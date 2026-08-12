import { request as httpRequest } from 'node:http';
import type { IncomingMessage } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { Stream } from 'node:stream';
import { pipeline } from 'node:stream/promises';

import type { DownloadOptions } from './types.js';
import { isCodedError } from './utils.js';

const RETRYABLE_HTTP_STATUS_CODES = new Set([408, 425, 429]);
const RETRYABLE_ERROR_CODES = new Set([
  'EAI_AGAIN',
  'ECONNREFUSED',
  'ECONNRESET',
  'EHOSTDOWN',
  'EHOSTUNREACH',
  'ENETDOWN',
  'ENETRESET',
  'ENETUNREACH',
  'EPIPE',
  'ERR_STREAM_PREMATURE_CLOSE',
  'ETIMEDOUT',
  'Z_BUF_ERROR',
]);

export const DEFAULT_DOWNLOAD_RETRY_OPTIONS = {
  maxAttempts: 5,
  initialDelayMs: 1_000,
  maxDelayMs: 30_000,
} as const;

export type DownloadRetryEvent = {
  attempt: number;
  maxAttempts: number;
  delayMs: number;
  error: unknown;
};

export type DownloadRetryConfiguration = {
  maxAttempts?: number;
  initialDelayMs?: number;
  maxDelayMs?: number;
};

export type DownloadRetryOptions = DownloadRetryConfiguration & {
  random?: () => number;
  sleep?: (delayMs: number) => Promise<void>;
  onRetry?: (event: DownloadRetryEvent) => void;
};

/**
 * An unsuccessful HTTP response received while downloading an archive.
 */
export class DownloadHttpError extends Error {
  readonly statusCode: number | undefined;

  constructor(
    url: URL,
    statusCode: number | undefined,
    statusMessage: string | undefined,
  ) {
    super(
      `Request to ${url} failed. Status Code: ${statusCode} - ${statusMessage}`,
    );
    this.name = 'DownloadHttpError';
    this.statusCode = statusCode;
  }
}

/**
 * Determines whether a failed download can reasonably succeed when retried.
 *
 * @param error - The download error.
 * @returns Whether the error is transient.
 */
export function isRetryableDownloadError(error: unknown): boolean {
  if (error instanceof DownloadHttpError) {
    const { statusCode } = error;
    return (
      statusCode !== undefined &&
      (RETRYABLE_HTTP_STATUS_CODES.has(statusCode) ||
        (statusCode >= 500 && statusCode <= 599))
    );
  }

  return isCodedError(error) && RETRYABLE_ERROR_CODES.has(error.code);
}

/**
 * Calculates an exponential retry delay with equal jitter.
 *
 * Equal jitter keeps at least half of the exponential delay while spreading
 * concurrent retry attempts across the remaining half.
 *
 * @param failedAttempt - The one-based attempt number that failed.
 * @param options - Backoff and randomness options.
 * @param options.initialDelayMs - The delay before exponential growth.
 * @param options.maxDelayMs - The maximum delay before jitter.
 * @param options.random - The source of randomness used for jitter.
 * @returns The delay before the next attempt, in milliseconds.
 */
export function calculateRetryDelay(
  failedAttempt: number,
  {
    initialDelayMs = DEFAULT_DOWNLOAD_RETRY_OPTIONS.initialDelayMs,
    maxDelayMs = DEFAULT_DOWNLOAD_RETRY_OPTIONS.maxDelayMs,
    random = Math.random,
  }: Pick<
    DownloadRetryOptions,
    'initialDelayMs' | 'maxDelayMs' | 'random'
  > = {},
): number {
  const exponentialDelay = Math.min(
    maxDelayMs,
    initialDelayMs * 2 ** (failedAttempt - 1),
  );
  const minimumDelay = exponentialDelay / 2;
  return Math.round(minimumDelay + random() * minimumDelay);
}

/**
 * Retries a download operation after transient failures.
 *
 * @param operation - The complete download operation to retry.
 * @param options - Retry, backoff, and observability options.
 * @param options.maxAttempts - The total number of attempts, including the first.
 * @param options.initialDelayMs - The delay before exponential growth.
 * @param options.maxDelayMs - The maximum delay before jitter.
 * @param options.random - The source of randomness used for jitter.
 * @param options.sleep - The function used to wait between attempts.
 * @param options.onRetry - A callback invoked before each retry.
 * @returns The result of the successful operation.
 * @throws The first permanent error or the final transient error.
 */
export async function retryDownload<Result>(
  operation: () => Promise<Result>,
  {
    maxAttempts = DEFAULT_DOWNLOAD_RETRY_OPTIONS.maxAttempts,
    initialDelayMs = DEFAULT_DOWNLOAD_RETRY_OPTIONS.initialDelayMs,
    maxDelayMs = DEFAULT_DOWNLOAD_RETRY_OPTIONS.maxDelayMs,
    random = Math.random,
    sleep = async (delayMs: number): Promise<void> =>
      await new Promise<void>((resolve) => setTimeout(resolve, delayMs)),
    onRetry,
  }: DownloadRetryOptions = {},
): Promise<Result> {
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      if (attempt === maxAttempts || !isRetryableDownloadError(error)) {
        throw error;
      }

      const delayMs = calculateRetryDelay(attempt, {
        initialDelayMs,
        maxDelayMs,
        random,
      });
      onRetry?.({
        attempt: attempt + 1,
        maxAttempts,
        delayMs,
        error,
      });
      await sleep(delayMs);
    }
  }

  throw new Error('Download retry loop completed unexpectedly');
}

/**
 * A PassThrough stream that emits a 'response' event when the HTTP(S) response is available.
 */
class DownloadStream extends Stream.PassThrough {
  /**
   * Returns a promise that resolves with the HTTP(S) IncomingMessage response.
   *
   * @returns The HTTP(S) response stream.
   */
  async response(): Promise<IncomingMessage> {
    return new Promise((resolve, reject) => {
      this.once('response', resolve);
      this.once('error', reject);
    });
  }
}

/**
 * Starts a download from the given URL.
 *
 * @param url - The URL to download from
 * @param options - The download options
 * @param redirects - The number of redirects that have occurred
 * @returns A stream of the download
 */
export function startDownload(
  url: URL,
  options: DownloadOptions = {},
  redirects: number = 0,
): DownloadStream {
  const MAX_REDIRECTS = options.maxRedirects ?? 5;
  const request = url.protocol === 'http:' ? httpRequest : httpsRequest;
  const stream = new DownloadStream();
  request(url, options, (response) => {
    stream.once('close', () => {
      response.destroy();
    });

    const { statusCode, statusMessage, headers } = response;
    // handle redirects
    if (
      statusCode &&
      statusCode >= 300 &&
      statusCode < 400 &&
      headers.location
    ) {
      if (redirects >= MAX_REDIRECTS) {
        stream.emit('error', new Error('Too many redirects'));
        response.destroy();
      } else {
        // note: we don't emit a response until we're done redirecting, because
        // handlers only expect it to be emitted once.
        pipeline(
          startDownload(new URL(headers.location, url), options, redirects + 1)
            // emit the response event to the stream
            .once('response', stream.emit.bind(stream, 'response')),
          stream,
        ).catch(stream.emit.bind(stream, 'error'));
        response.destroy();
      }
    }

    // check for HTTP errors
    else if (!statusCode || statusCode < 200 || statusCode >= 300) {
      stream.emit(
        'error',
        new DownloadHttpError(url, statusCode, statusMessage),
      );
      response.destroy();
    } else {
      // resolve with response stream
      stream.emit('response', response);

      response.once('error', stream.emit.bind(stream, 'error'));
      pipeline(response, stream).catch(stream.emit.bind(stream, 'error'));
    }
  })
    .once('error', stream.emit.bind(stream, 'error'))
    .end();
  return stream;
}
