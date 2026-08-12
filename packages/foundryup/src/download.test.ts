import {
  calculateRetryDelay,
  DEFAULT_DOWNLOAD_RETRY_OPTIONS,
  DownloadHttpError,
  isRetryableDownloadError,
  retryDownload,
} from './download.js';

describe('calculateRetryDelay', () => {
  it('applies equal jitter to exponential delays', () => {
    const random = jest.fn().mockReturnValue(0.5);

    expect(calculateRetryDelay(1, { random })).toBe(750);
    expect(calculateRetryDelay(2, { random })).toBe(1_500);
    expect(calculateRetryDelay(3, { random })).toBe(3_000);
  });

  it('caps the exponential delay', () => {
    expect(
      calculateRetryDelay(10, {
        initialDelayMs: 1_000,
        maxDelayMs: 10_000,
        random: () => 0.5,
      }),
    ).toBe(7_500);
  });
});

describe('isRetryableDownloadError', () => {
  it.each([408, 425, 429, 500, 503])(
    'returns true for HTTP status %s',
    (statusCode) => {
      expect(
        isRetryableDownloadError(
          new DownloadHttpError(
            new URL('https://example.com/archive.tar.gz'),
            statusCode,
            'Request failed',
          ),
        ),
      ).toBe(true);
    },
  );

  it.each([400, 401, 403, 404])(
    'returns false for HTTP status %s',
    (statusCode) => {
      expect(
        isRetryableDownloadError(
          new DownloadHttpError(
            new URL('https://example.com/archive.tar.gz'),
            statusCode,
            'Request failed',
          ),
        ),
      ).toBe(false);
    },
  );

  it('returns true for transient network errors', () => {
    const error = new Error('socket hang up') as NodeJS.ErrnoException;
    error.code = 'ECONNRESET';

    expect(isRetryableDownloadError(error)).toBe(true);
  });

  it('returns false for permanent errors', () => {
    expect(isRetryableDownloadError(new Error('checksum mismatch'))).toBe(
      false,
    );
  });
});

describe('retryDownload', () => {
  it('retries transient failures with exponential backoff and jitter', async () => {
    const transientError = new Error('socket hang up') as NodeJS.ErrnoException;
    transientError.code = 'ECONNRESET';
    const operation = jest
      .fn<Promise<string>, []>()
      .mockRejectedValueOnce(transientError)
      .mockRejectedValueOnce(transientError)
      .mockResolvedValue('downloaded');
    const sleep = jest.fn<Promise<void>, [number]>();
    sleep.mockResolvedValue(undefined);
    const onRetry = jest.fn();

    const result = await retryDownload(operation, {
      random: () => 0.5,
      sleep,
      onRetry,
    });

    expect(result).toBe('downloaded');
    expect(operation).toHaveBeenCalledTimes(3);
    expect(sleep.mock.calls).toStrictEqual([[750], [1_500]]);
    expect(onRetry).toHaveBeenNthCalledWith(1, {
      attempt: 2,
      maxAttempts: DEFAULT_DOWNLOAD_RETRY_OPTIONS.maxAttempts,
      delayMs: 750,
      error: transientError,
    });
    expect(onRetry).toHaveBeenNthCalledWith(2, {
      attempt: 3,
      maxAttempts: DEFAULT_DOWNLOAD_RETRY_OPTIONS.maxAttempts,
      delayMs: 1_500,
      error: transientError,
    });
  });

  it('does not retry permanent failures', async () => {
    const operation = jest.fn().mockRejectedValue(new Error('Invalid URL'));
    const sleep = jest.fn<Promise<void>, [number]>();

    await expect(retryDownload(operation, { sleep })).rejects.toThrow(
      'Invalid URL',
    );
    expect(operation).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it('stops after the default maximum number of attempts', async () => {
    const transientError = new Error('socket hang up') as NodeJS.ErrnoException;
    transientError.code = 'ECONNRESET';
    const operation = jest.fn().mockRejectedValue(transientError);
    const sleep = jest.fn<Promise<void>, [number]>();
    sleep.mockResolvedValue(undefined);

    await expect(
      retryDownload(operation, { random: () => 0.5, sleep }),
    ).rejects.toBe(transientError);
    expect(operation).toHaveBeenCalledTimes(
      DEFAULT_DOWNLOAD_RETRY_OPTIONS.maxAttempts,
    );
    expect(sleep.mock.calls).toStrictEqual([[750], [1_500], [3_000], [6_000]]);
  });
});
