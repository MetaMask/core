import type { SentinelSimulationResponse } from '@metamask/sentinel-api-service';
import type { Hex } from '@metamask/utils';
import { cloneDeep } from 'lodash';

import {
  CODE_DELEGATION_MANAGER_NO_SIGNATURE_ERRORS,
  DELEGATION_MANAGER_ADDRESSES,
} from '../constants';
import type { TransactionControllerMessenger } from '../TransactionController';
import type { SimulationRequest } from './simulation-api';
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

const RESPONSE_MOCK: SentinelSimulationResponse = {
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

/**
 * Create a mock {@link TransactionControllerMessenger} whose `call` method is
 * a jest mock that resolves the `SentinelApiService:simulateTransactions`
 * action with {@link RESPONSE_MOCK}.
 *
 * @returns The messenger mock and its underlying `call` jest mock.
 */
function createMessengerMock(): {
  messenger: TransactionControllerMessenger;
  callMock: jest.Mock;
} {
  const callMock = jest.fn().mockResolvedValue(RESPONSE_MOCK);
  const messenger = { call: callMock } as unknown as TransactionControllerMessenger;
  return { messenger, callMock };
}

describe('Simulation API Utils', () => {
  let messenger: TransactionControllerMessenger;
  let callMock: jest.Mock;

  beforeEach(() => {
    ({ messenger, callMock } = createMessengerMock());
  });

  describe('simulateTransactions', () => {
    it('returns response from the Sentinel simulation action', async () => {
      expect(
        await simulateTransactions(messenger, CHAIN_ID_MOCK, REQUEST_MOCK),
      ).toStrictEqual(RESPONSE_MOCK);
    });

    it('invokes the Sentinel simulation action with the chain ID and finalized request', async () => {
      await simulateTransactions(messenger, CHAIN_ID_MOCK, REQUEST_MOCK);

      expect(callMock).toHaveBeenCalledTimes(1);
      expect(callMock).toHaveBeenCalledWith(
        'SentinelApiService:simulateTransactions',
        CHAIN_ID_MOCK,
        REQUEST_MOCK,
        {},
      );
    });

    it('does not forward getSimulationConfig to the Sentinel simulation action', async () => {
      const getSimulationConfig = jest.fn().mockResolvedValue({});

      await simulateTransactions(messenger, CHAIN_ID_MOCK, {
        ...REQUEST_MOCK,
        getSimulationConfig,
      });

      const forwardedRequest = callMock.mock.calls[0][2] as SimulationRequest;

      expect(forwardedRequest).not.toHaveProperty('getSimulationConfig');
      expect(forwardedRequest).toStrictEqual(REQUEST_MOCK);
    });

    it('passes a getUrl option that resolves to newUrl when getSimulationConfig returns one', async () => {
      const newUrl = 'https://shield.example.com/simulate';
      const getSimulationConfig = jest.fn().mockResolvedValue({ newUrl });

      await simulateTransactions(messenger, CHAIN_ID_MOCK, {
        ...REQUEST_MOCK,
        getSimulationConfig,
      });

      const options = callMock.mock.calls[0][3] as {
        getUrl?: (defaultUrl: string) => Promise<string>;
      };

      expect(options.getUrl).toBeDefined();
      expect(await options.getUrl?.('https://default.example.com')).toBe(
        newUrl,
      );
      expect(getSimulationConfig).toHaveBeenCalledWith(
        'https://default.example.com',
      );
    });

    it('passes a getUrl option that falls back to the default URL when getSimulationConfig returns no newUrl', async () => {
      const getSimulationConfig = jest.fn().mockResolvedValue({});
      const defaultUrl = 'https://default.example.com';

      await simulateTransactions(messenger, CHAIN_ID_MOCK, {
        ...REQUEST_MOCK,
        getSimulationConfig,
      });

      const options = callMock.mock.calls[0][3] as {
        getUrl?: (defaultUrl: string) => Promise<string>;
      };

      expect(await options.getUrl?.(defaultUrl)).toBe(defaultUrl);
    });

    it('falls back to the default URL when getSimulationConfig resolves to undefined', async () => {
      const getSimulationConfig = jest.fn().mockResolvedValue(undefined);
      const defaultUrl = 'https://default.example.com';

      await simulateTransactions(messenger, CHAIN_ID_MOCK, {
        ...REQUEST_MOCK,
        getSimulationConfig,
      });

      const options = callMock.mock.calls[0][3] as {
        getUrl?: (defaultUrl: string) => Promise<string>;
      };

      expect(await options.getUrl?.(defaultUrl)).toBe(defaultUrl);
    });

    it('does not pass a getUrl option when getSimulationConfig is absent', async () => {
      await simulateTransactions(messenger, CHAIN_ID_MOCK, REQUEST_MOCK);

      const options = callMock.mock.calls[0][3];

      expect(options).toStrictEqual({});
    });

    it('does not mutate the original request', async () => {
      const request = cloneDeep(REQUEST_MOCK);

      await simulateTransactions(messenger, CHAIN_ID_MOCK, request);

      expect(request).toStrictEqual(REQUEST_MOCK);
    });

    it('propagates errors thrown by the Sentinel simulation action', async () => {
      const error = new Error('Test Error Message');
      callMock.mockRejectedValueOnce(error);

      await expect(
        simulateTransactions(messenger, CHAIN_ID_MOCK, REQUEST_MOCK),
      ).rejects.toThrow(error);
    });

    it('overrides DelegationManager code before delegating', async () => {
      const request = cloneDeep(REQUEST_MOCK);
      request.transactions[0].to =
        DELEGATION_MANAGER_ADDRESSES[0].toUpperCase() as Hex;

      await simulateTransactions(messenger, CHAIN_ID_MOCK, request);

      const finalizedRequest = callMock.mock.calls[0][2] as SimulationRequest;

      expect(
        finalizedRequest.overrides?.[DELEGATION_MANAGER_ADDRESSES[0] as Hex],
      ).toStrictEqual({
        code: CODE_DELEGATION_MANAGER_NO_SIGNATURE_ERRORS,
      });
    });

    it('initializes overrides when overriding DelegationManager code with no existing overrides', async () => {
      const request: SimulationRequest = {
        transactions: [
          {
            from: '0x1',
            to: DELEGATION_MANAGER_ADDRESSES[0] as Hex,
            value: '0x1',
          },
        ],
      };

      await simulateTransactions(messenger, CHAIN_ID_MOCK, request);

      const finalizedRequest = callMock.mock.calls[0][2] as SimulationRequest;

      expect(finalizedRequest.overrides).toStrictEqual({
        [DELEGATION_MANAGER_ADDRESSES[0]]: {
          code: CODE_DELEGATION_MANAGER_NO_SIGNATURE_ERRORS,
        },
      });
    });

    it('does not apply DelegationManager override for other recipients', async () => {
      await simulateTransactions(messenger, CHAIN_ID_MOCK, REQUEST_MOCK);

      const finalizedRequest = callMock.mock.calls[0][2] as SimulationRequest;

      expect(finalizedRequest.overrides).toStrictEqual(REQUEST_MOCK.overrides);
    });
  });
});
