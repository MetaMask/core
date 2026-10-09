import {
  SentinelChainNotSupportedError,
  SentinelJsonRpcError,
} from '@metamask/sentinel-api-service';
import type { Hex } from '@metamask/utils';
import { cloneDeep } from 'lodash-es';

import {
  CODE_DELEGATION_MANAGER_NO_SIGNATURE_ERRORS,
  DELEGATION_MANAGER_ADDRESSES,
} from '../constants.js';
import type { TransactionControllerMessenger } from '../TransactionController.js';
import type { GetSimulationConfig } from '../types.js';
import type {
  SimulationRequest,
  SimulationResponse,
} from './simulation-api.js';
import { simulateTransactions } from './simulation-api.js';

const CHAIN_ID_MOCK = '0x1';
const DEFAULT_URL = 'https://tx-sentinel-test-subdomain.api.cx.metamask.io/';
const GET_SIMULATION_CONFIG_MOCK: GetSimulationConfig = jest
  .fn()
  .mockResolvedValue({});

const REQUEST_MOCK: SimulationRequest = {
  getSimulationConfig: GET_SIMULATION_CONFIG_MOCK,
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
  sponsorship: {
    isSponsored: false,
    error: null,
  },
};

type SimulationServiceCall = (
  action: 'SentinelApiService:simulateTransactions',
  chainId: Hex,
  request: Omit<SimulationRequest, 'getSimulationConfig'>,
  options: {
    getUrl: (
      defaultUrl: string,
    ) => Promise<string | { url: string; authorization?: string }>;
  },
) => Promise<SimulationResponse>;

describe('Simulation API Utils', () => {
  let callMock: jest.MockedFunction<SimulationServiceCall>;
  let messenger: TransactionControllerMessenger;

  beforeEach(() => {
    callMock = jest
      .fn<
        ReturnType<SimulationServiceCall>,
        Parameters<SimulationServiceCall>
      >()
      .mockResolvedValue(RESPONSE_MOCK);
    messenger = {
      call: callMock,
    } as unknown as TransactionControllerMessenger;
  });

  describe('simulateTransactions', () => {
    it('returns the simulation result', async () => {
      expect(
        await simulateTransactions({
          chainId: CHAIN_ID_MOCK,
          request: REQUEST_MOCK,
          messenger,
        }),
      ).toStrictEqual(RESPONSE_MOCK);
    });

    it('rejects when the chain is not supported', async () => {
      const unsupportedChainError = new SentinelChainNotSupportedError(
        CHAIN_ID_MOCK,
        'confirmations',
      );
      callMock.mockRejectedValue(unsupportedChainError);

      await expect(
        simulateTransactions({
          chainId: CHAIN_ID_MOCK,
          request: REQUEST_MOCK,
          messenger,
        }),
      ).rejects.toBe(unsupportedChainError);
    });

    it('rejects when the service returns a JSON-RPC error', async () => {
      const jsonRpcError = new SentinelJsonRpcError(
        'Sentinel API: JSON-RPC error: failed',
        123,
      );
      callMock.mockRejectedValue(jsonRpcError);

      await expect(
        simulateTransactions({
          chainId: CHAIN_ID_MOCK,
          request: REQUEST_MOCK,
          messenger,
        }),
      ).rejects.toBe(jsonRpcError);
    });

    it('rejects when the result is missing', async () => {
      const missingResult = new SentinelJsonRpcError(
        'Sentinel API: JSON-RPC response missing result',
        -32603,
      );
      callMock.mockRejectedValue(missingResult);

      await expect(
        simulateTransactions({
          chainId: CHAIN_ID_MOCK,
          request: REQUEST_MOCK,
          messenger,
        }),
      ).rejects.toBe(missingResult);
    });

    it('propagates a getSimulationConfig failure', async () => {
      const configError = new Error('config failed');
      callMock.mockImplementation(
        async (_action, _chainId, _request, options) => {
          await options.getUrl(DEFAULT_URL);
          return RESPONSE_MOCK;
        },
      );

      await expect(
        simulateTransactions({
          chainId: CHAIN_ID_MOCK,
          request: {
            ...REQUEST_MOCK,
            getSimulationConfig: jest.fn().mockRejectedValue(configError),
          },
          messenger,
        }),
      ).rejects.toBe(configError);
    });

    it('sends the simulation request without getSimulationConfig', async () => {
      await simulateTransactions({
        chainId: CHAIN_ID_MOCK,
        request: REQUEST_MOCK,
        messenger,
      });

      const { getSimulationConfig: _getSimulationConfig, ...expectedRequest } =
        REQUEST_MOCK;

      const [action, chainId, requestBody, options] = callMock.mock.calls[0];
      expect(action).toBe('SentinelApiService:simulateTransactions');
      expect(chainId).toBe(CHAIN_ID_MOCK);
      expect(requestBody).toStrictEqual(expectedRequest);
      expect(typeof options.getUrl).toBe('function');
    });

    it('applies the simulation config URL and authorization', async () => {
      const newUrl =
        'https://tx-sentinel-new-test-subdomain.api.cx.metamask.io/';
      let resolvedUrl: unknown;
      callMock.mockImplementation(
        async (_action, _chainId, _request, options) => {
          resolvedUrl = await options.getUrl(DEFAULT_URL);
          return RESPONSE_MOCK;
        },
      );

      await simulateTransactions({
        chainId: CHAIN_ID_MOCK,
        request: {
          ...REQUEST_MOCK,
          getSimulationConfig: jest.fn().mockResolvedValue({
            authorization: 'Bearer test',
            newUrl,
          }),
        },
        messenger,
      });

      expect(resolvedUrl).toStrictEqual({
        url: newUrl,
        authorization: 'Bearer test',
      });
    });

    it('overrides DelegationManager code', async () => {
      const request = cloneDeep(REQUEST_MOCK);
      request.transactions[0].to =
        DELEGATION_MANAGER_ADDRESSES[0].toUpperCase() as Hex;

      await simulateTransactions({
        chainId: CHAIN_ID_MOCK,
        request,
        messenger,
      });

      const requestBody = callMock.mock.calls[0][2] as SimulationRequest;

      expect(
        requestBody.overrides?.[DELEGATION_MANAGER_ADDRESSES[0] as Hex],
      ).toStrictEqual({
        code: CODE_DELEGATION_MANAGER_NO_SIGNATURE_ERRORS,
      });
    });
  });
});
