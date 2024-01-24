import { assertIsError, graphQL } from './util';

describe('Utils', () => {
  describe('graphQL', () => {
    const URL_MOCK = 'http://test.com';
    const QUERY_MOCK = 'query';
    const VARIABLES_MOCK = { test: 'value' };
    const DATA_MOCK = { test2: 'value2' };
    const JSON_MOCK = { data: DATA_MOCK };
    // TODO: Replace `any` with type
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const RESPONSE_MOCK = { ok: true, json: () => JSON_MOCK } as any;

    it('fetches URL with graphQL body', async () => {
      const mockFetch = jest.spyOn(global, 'fetch');

      mockFetch.mockResolvedValueOnce(RESPONSE_MOCK);

      const response = await graphQL(URL_MOCK, QUERY_MOCK, VARIABLES_MOCK);

      expect(response).toStrictEqual(DATA_MOCK);

      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(mockFetch).toHaveBeenCalledWith(URL_MOCK, {
        body: '{"query":"query","variables":{"test":"value"}}',
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
      });
    });

    it('returns undefined if no response', async () => {
      const mockFetch = jest.spyOn(global, 'fetch');

      mockFetch.mockResolvedValueOnce({
        ...RESPONSE_MOCK,
        json: () => undefined,
      });

      const response = await graphQL(URL_MOCK, QUERY_MOCK, VARIABLES_MOCK);

      expect(response).toBeUndefined();
    });

    it('throws if response is not ok', async () => {
      const mockFetch = jest.spyOn(global, 'fetch');

      // TODO: Replace `any` with type
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      mockFetch.mockResolvedValueOnce({ ok: false, status: 500 } as any);

      await expect(
        graphQL(URL_MOCK, QUERY_MOCK, VARIABLES_MOCK),
      ).rejects.toThrow(
        `Fetch failed with status '500' for request '${URL_MOCK}'`,
      );
    });
  });

  describe('assertIsError', () => {
    it('does not throw if given an error', () => {
      expect(() => assertIsError(new Error('test'))).not.toThrow();
    });

    it('throws if passed something that is not an error', () => {
      expect(() => assertIsError('test')).toThrow(
        `Invalid error of type 'string'`,
      );
    });
  });
});
