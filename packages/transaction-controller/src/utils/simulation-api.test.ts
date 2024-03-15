import { CHAIN_IDS } from '../constants';
import type { SimulationRequest, SimulationResponse } from './simulation-api';
import { simulateTransactions } from './simulation-api';

const CHAIN_ID_MOCK = '0x1';
const ERROR_CODE_MOCK = 123;
const ERROR_MESSAGE_MOCK = 'Test Error Message';

const REQUEST_MOCK: SimulationRequest = {
  transactions: [{ from: '0x1', to: '0x2', value: '0x1' }],
  overrides: {
    '0x1': {
      stateDiff: {
        '0x2': '0x3',
      },
    },
  },
  withCallTrace: true,
  withLogs: false,
};

const RESPONSE_MOCK: SimulationResponse = {
  transactions: [
    {
      return: '0x1',
      callTrace: {
        calls: [],
        logs: [],
      },
      stateDiff: {
        pre: {
          '0x1': {
            balance: '0x1',
          },
        },
        post: {
          '0x1': {
            balance: '0x0',
          },
        },
      },
    },
  ],
};

describe('Simulation API Utils', () => {
  let fetchMock: jest.MockedFunction<typeof fetch>;

  /**
   * Mock a JSON response from fetch.
   * @param jsonResponse - The response body to return.
   */
  function mockFetchResponse(jsonResponse: unknown) {
    fetchMock.mockResolvedValue({
      json: jest.fn().mockResolvedValue(jsonResponse),
    } as unknown as Response);
  }

  beforeEach(() => {
    jest.resetAllMocks();

    fetchMock = jest.spyOn(global, 'fetch') as jest.MockedFunction<
      typeof fetch
    >;

    mockFetchResponse({ result: RESPONSE_MOCK });
  });

  describe('simulateTransactions', () => {
    it('returns response from RPC provider', async () => {
      expect(await simulateTransactions('0x1', REQUEST_MOCK)).toStrictEqual(
        RESPONSE_MOCK,
      );
    });

    it('sends request', async () => {
      await simulateTransactions(CHAIN_ID_MOCK, REQUEST_MOCK);

      expect(fetchMock).toHaveBeenCalledTimes(1);

      const requestBody = JSON.parse(
        fetchMock.mock.calls[0][1]?.body?.toString() ?? '{}',
      );

      expect(requestBody.params[0]).toStrictEqual(REQUEST_MOCK);
    });

    it('throws if chain ID not supported', async () => {
      const unsupportedChainId = '0x123';

      await expect(
        simulateTransactions(unsupportedChainId, REQUEST_MOCK),
      ).rejects.toThrow(`Chain is not supported: ${unsupportedChainId}`);
    });

    it('uses URL specific to chain ID', async () => {
      await simulateTransactions(CHAIN_IDS.GOERLI, REQUEST_MOCK);

      expect(fetchMock).toHaveBeenCalledWith(
        'https://tx-sentinel-ethereum-goerli.api.cx.metamask.io/',
        expect.any(Object),
      );
    });

    it('throws if response has error', async () => {
      mockFetchResponse({
        error: { code: ERROR_CODE_MOCK, message: ERROR_MESSAGE_MOCK },
      });

      await expect(
        simulateTransactions(CHAIN_ID_MOCK, REQUEST_MOCK),
      ).rejects.toStrictEqual({
        code: ERROR_CODE_MOCK,
        message: ERROR_MESSAGE_MOCK,
      });
    });
  });
});
