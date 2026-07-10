import type { SentinelApiService } from '@metamask/sentinel-api-service';
import type { Hex } from '@metamask/utils';
import { cloneDeep } from 'lodash';

import {
  CODE_DELEGATION_MANAGER_NO_SIGNATURE_ERRORS,
  DELEGATION_MANAGER_ADDRESSES,
} from '../constants';
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
  sponsorship: {
    isSponsored: false,
    error: null,
  },
};

/**
 * Create a mock {@link SentinelApiService} exposing jest-mocked
 * `simulateTransactions` and `getNetworks` methods.
 *
 * @returns The mocked service.
 */
function createSentinelApiServiceMock(): jest.Mocked<
  Pick<SentinelApiService, 'simulateTransactions' | 'getNetworks'>
> {
  return {
    simulateTransactions: jest.fn(),
    getNetworks: jest.fn(),
  } as unknown as jest.Mocked<
    Pick<SentinelApiService, 'simulateTransactions' | 'getNetworks'>
  >;
}

describe('Simulation API Utils', () => {
  let sentinelApiServiceMock: ReturnType<typeof createSentinelApiServiceMock>;

  beforeEach(() => {
    sentinelApiServiceMock = createSentinelApiServiceMock();

    sentinelApiServiceMock.simulateTransactions.mockResolvedValue(
      RESPONSE_MOCK as never,
    );
  });

  describe('simulateTransactions', () => {
    it('returns response from the Sentinel API service', async () => {
      expect(
        await simulateTransactions(
          sentinelApiServiceMock as unknown as SentinelApiService,
          CHAIN_ID_MOCK,
          REQUEST_MOCK,
        ),
      ).toStrictEqual(RESPONSE_MOCK);
    });

    it('delegates to the Sentinel API service with the chain ID and finalized request', async () => {
      await simulateTransactions(
        sentinelApiServiceMock as unknown as SentinelApiService,
        CHAIN_ID_MOCK,
        REQUEST_MOCK,
      );

      expect(
        sentinelApiServiceMock.simulateTransactions,
      ).toHaveBeenCalledTimes(1);
      expect(sentinelApiServiceMock.simulateTransactions).toHaveBeenCalledWith(
        CHAIN_ID_MOCK,
        REQUEST_MOCK,
      );
    });

    it('does not mutate the original request', async () => {
      const request = cloneDeep(REQUEST_MOCK);

      await simulateTransactions(
        sentinelApiServiceMock as unknown as SentinelApiService,
        CHAIN_ID_MOCK,
        request,
      );

      expect(request).toStrictEqual(REQUEST_MOCK);
    });

    it('propagates errors thrown by the Sentinel API service', async () => {
      const error = new Error('Test Error Message');
      sentinelApiServiceMock.simulateTransactions.mockRejectedValueOnce(error);

      await expect(
        simulateTransactions(
          sentinelApiServiceMock as unknown as SentinelApiService,
          CHAIN_ID_MOCK,
          REQUEST_MOCK,
        ),
      ).rejects.toThrow(error);
    });

    it('overrides DelegationManager code before delegating', async () => {
      const request = cloneDeep(REQUEST_MOCK);
      request.transactions[0].to =
        DELEGATION_MANAGER_ADDRESSES[0].toUpperCase() as Hex;

      await simulateTransactions(
        sentinelApiServiceMock as unknown as SentinelApiService,
        CHAIN_ID_MOCK,
        request,
      );

      const finalizedRequest =
        sentinelApiServiceMock.simulateTransactions.mock.calls[0][1];

      expect(
        (finalizedRequest as unknown as SimulationRequest).overrides?.[
          DELEGATION_MANAGER_ADDRESSES[0]
        ],
      ).toStrictEqual({
        code: CODE_DELEGATION_MANAGER_NO_SIGNATURE_ERRORS,
      });
    });

    it('initializes overrides when overriding DelegationManager code with no existing overrides', async () => {
      const request: SimulationRequest = {
        transactions: [
          { from: '0x1', to: DELEGATION_MANAGER_ADDRESSES[0], value: '0x1' },
        ],
      };

      await simulateTransactions(
        sentinelApiServiceMock as unknown as SentinelApiService,
        CHAIN_ID_MOCK,
        request,
      );

      const finalizedRequest = sentinelApiServiceMock.simulateTransactions.mock
        .calls[0][1] as unknown as SimulationRequest;

      expect(finalizedRequest.overrides).toStrictEqual({
        [DELEGATION_MANAGER_ADDRESSES[0]]: {
          code: CODE_DELEGATION_MANAGER_NO_SIGNATURE_ERRORS,
        },
      });
    });

    it('does not apply DelegationManager override for other recipients', async () => {
      await simulateTransactions(
        sentinelApiServiceMock as unknown as SentinelApiService,
        CHAIN_ID_MOCK,
        REQUEST_MOCK,
      );

      const finalizedRequest = sentinelApiServiceMock.simulateTransactions.mock
        .calls[0][1] as unknown as SimulationRequest;

      expect(finalizedRequest.overrides).toStrictEqual(REQUEST_MOCK.overrides);
    });
  });
});
