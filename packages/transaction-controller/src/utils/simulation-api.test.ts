import { JsonRpcProvider } from '@ethersproject/providers';

import { CHAIN_IDS } from '../constants';
import type { SimulationRequest, SimulationResponse } from './simulation-api';
import { simulateTransactions } from './simulation-api';

jest.mock('@ethersproject/providers', () => ({
  ...jest.requireActual('@ethersproject/providers'),
  JsonRpcProvider: jest.fn(),
}));

const CHAIN_ID_MOCK = '0x1';

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

/**
 * Creates a mock of the JSON-RPC provider.
 * @returns The JSON-RPC provider mock.
 */
function createJsonRpcProviderMock() {
  return {
    send: jest.fn(),
  } as unknown as jest.Mocked<JsonRpcProvider>;
}

describe('Simulation API Utils', () => {
  const jsonRpcProviderClassMock = jest.mocked(JsonRpcProvider);
  let jsonRpcProviderMock: jest.Mocked<JsonRpcProvider>;

  beforeEach(() => {
    jest.resetAllMocks();

    jsonRpcProviderMock = createJsonRpcProviderMock();
    jsonRpcProviderMock.send.mockResolvedValueOnce(RESPONSE_MOCK);

    jsonRpcProviderClassMock.mockReturnValue(jsonRpcProviderMock);
  });

  describe('simulateTransactions', () => {
    it('returns response from RPC provider', async () => {
      expect(await simulateTransactions('0x1', REQUEST_MOCK)).toStrictEqual(
        RESPONSE_MOCK,
      );
    });

    it('sends request to RPC provider', async () => {
      await simulateTransactions(CHAIN_ID_MOCK, REQUEST_MOCK);

      expect(jsonRpcProviderMock.send).toHaveBeenCalledTimes(1);
      expect(jsonRpcProviderMock.send).toHaveBeenCalledWith(
        'infura_simulateTransactions',
        [REQUEST_MOCK],
      );
    });

    it('throws if chain ID not supported', async () => {
      const unsupportedChainId = '0x123';

      await expect(
        simulateTransactions(unsupportedChainId, REQUEST_MOCK),
      ).rejects.toThrow(`Chain is not supported: ${unsupportedChainId}`);
    });

    it('uses URL specific to chain ID', async () => {
      await simulateTransactions(CHAIN_IDS.GOERLI, REQUEST_MOCK);

      expect(jsonRpcProviderClassMock).toHaveBeenCalledWith(
        'https://tx-sentinel-ethereum-goerli.api.cx.metamask.io/',
      );
    });
  });
});
