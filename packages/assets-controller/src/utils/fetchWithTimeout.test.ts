import { fetchWithTimeout } from './fetchWithTimeout';

describe('fetchWithTimeout', () => {
  it('resolves with the task value when it settles in time', async () => {
    const result = await fetchWithTimeout(async () => 42, 100);
    expect(result).toBe(42);
  });

  it('rejects with a timeout error when the task outruns the timeout', async () => {
    await expect(
      fetchWithTimeout(() => new Promise(() => undefined), 10),
    ).rejects.toThrow('Fetch timed out after 10ms');
  });

  it('propagates task errors', async () => {
    await expect(
      fetchWithTimeout(async () => {
        throw new Error('boom');
      }, 100),
    ).rejects.toThrow('boom');
  });

  it('clears the timeout when the task resolves first', async () => {
    const clearSpy = jest.spyOn(global, 'clearTimeout');
    await fetchWithTimeout(async () => 'done', 1_000);
    expect(clearSpy).toHaveBeenCalled();
    clearSpy.mockRestore();
  });
});
