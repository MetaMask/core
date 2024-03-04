import * as JsonRpcProviderModule from '@ethersproject/providers';

import { CHAIN_IDS } from '../constants';
import type { SimulationRequest, SimulationResponse } from './simulation-api';
import { simulateTransactions } from './simulation-api';

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

describe('Simulation API Utils', () => {
  let jsonSendMock: jest.SpyInstance;

  beforeEach(() => {
    jest.resetAllMocks();

    jsonSendMock = jest.spyOn(
      JsonRpcProviderModule.JsonRpcProvider.prototype,
      'send',
    );

    jsonSendMock.mockResolvedValueOnce(RESPONSE_MOCK);
  });

  describe('simulateTransactions', () => {
    it('returns response from RPC provider', async () => {
      expect(await simulateTransactions('0x1', REQUEST_MOCK)).toStrictEqual(
        RESPONSE_MOCK,
      );
    });

    it('sends request to RPC provider', async () => {
      await simulateTransactions(CHAIN_ID_MOCK, REQUEST_MOCK);

      expect(jsonSendMock).toHaveBeenCalledWith('infura_simulateTransactions', [
        REQUEST_MOCK,
      ]);
    });

    it('throws if chain ID not supported', async () => {
      const unsupportedChainId = '0x123';

      await expect(
        simulateTransactions(unsupportedChainId, REQUEST_MOCK),
      ).rejects.toThrow(`Chain is not supported: ${unsupportedChainId}`);
    });

    it('uses URL specific to chain ID', async () => {
      const rpcProviderConstructorMock = jest.spyOn(
        JsonRpcProviderModule,
        'JsonRpcBatchProvider',
      );

      await simulateTransactions(CHAIN_IDS.GOERLI, REQUEST_MOCK);

      expect(rpcProviderConstructorMock).toHaveBeenCalledWith(
        'https://tx-sentinel-ethereum-goerli.api.cx.metamask.io/',
      );
    });
  });
});
