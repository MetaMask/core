import {
  isRateLimitError,
  withRateLimitRetry,
} from '../../../src/utils/rateLimitRetry.js';
import { wait } from '../../../src/utils/wait.js';

jest.mock('../../../src/utils/wait', () => ({
  wait: jest.fn().mockResolvedValue(undefined),
}));

const rateLimited = Object.assign(new Error('429 Too Many Requests'), {
  response: { status: 429 },
});

describe('isRateLimitError', () => {
  it.each([
    ['an SDK error with a 429 response', rateLimited],
    ['a 429 message without a response', new Error('429 client error')],
    ['a Too Many Requests message', new Error('Too Many Requests')],
  ])('recognizes %s', (_label, error) => {
    expect(isRateLimitError(error)).toBe(true);
  });

  it.each([
    ['another HTTP status', { response: { status: 500 }, message: '500' }],
    ['a network error', new Error('The operation was aborted.')],
    ['a value that is not an error', undefined],
  ])('ignores %s', (_label, error) => {
    expect(isRateLimitError(error)).toBe(false);
  });
});

describe('withRateLimitRetry', () => {
  beforeEach(() => {
    jest.mocked(wait).mockResolvedValue(undefined);
    jest.spyOn(Math, 'random').mockReturnValue(0.5);
  });

  it('retries a rate-limited read with jittered exponential backoff', async () => {
    const read = jest
      .fn()
      .mockRejectedValueOnce(rateLimited)
      .mockRejectedValueOnce(rateLimited)
      .mockResolvedValue('ok');

    expect(await withRateLimitRetry(read)).toBe('ok');
    expect(read).toHaveBeenCalledTimes(3);
    expect(jest.mocked(wait).mock.calls).toStrictEqual([[250], [500]]);
  });

  it('rethrows the 429 once the retries are spent', async () => {
    const read = jest.fn().mockRejectedValue(rateLimited);

    await expect(withRateLimitRetry(read)).rejects.toBe(rateLimited);
    expect(read).toHaveBeenCalledTimes(3);
  });

  it('does not retry other errors', async () => {
    const failure = new Error('offline');
    const read = jest.fn().mockRejectedValue(failure);

    await expect(withRateLimitRetry(read)).rejects.toBe(failure);
    expect(read).toHaveBeenCalledTimes(1);
    expect(wait).not.toHaveBeenCalled();
  });
});
