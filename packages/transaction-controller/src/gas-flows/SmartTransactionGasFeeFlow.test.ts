import EthQuery from '@metamask/eth-query';

import type {
  GasFeeFlowRequest,
  GasFeeFlowResponse,
  TransactionMeta,
  GetSmartTransactionFeeEstimatesResponse,
} from '../types';
import { TransactionStatus } from '../types';
import { DefaultGasFeeFlow } from './DefaultGasFeeFlow';
import { SmartTransactionGasFeeFlow } from './SmartTransactionGasFeeFlow';

jest.mock('@metamask/controller-utils', () => ({
  ...jest.requireActual('@metamask/controller-utils'),
  query: jest.fn(),
}));

const TRANSACTION_META_MOCK: TransactionMeta = {
  id: '1',
  chainId: '0x123',
  status: TransactionStatus.unapproved,
  time: 0,
  txParams: {
    from: '0x123',
  },
  isSmartTransaction: true,
};

const SMART_TRANSACTION_GAS_FEES_API_RESPONSE_MOCK = {
  tradeTxFees: {
    fees: [
      { maxFeePerGas: 50, maxPriorityFeePerGas: 50 },
      { maxFeePerGas: 100, maxPriorityFeePerGas: 100 },
      { maxFeePerGas: 200, maxPriorityFeePerGas: 200 },
    ],
  },
};

const RESPONSE_MOCK: GasFeeFlowResponse = {
  estimates: {
    low: {
      maxFeePerGas: '0x64', // 100
      maxPriorityFeePerGas: '0x64', // 100
    },
    medium: {
      maxFeePerGas: '0x87', // 135
      maxPriorityFeePerGas: '0x69', // 105
    },
    high: {
      maxFeePerGas: '0xaa', // 170
      maxPriorityFeePerGas: '0x6e', // 110
    },
  },
};

describe('SmartTransactionGasFeeFlow', () => {
  let request: GasFeeFlowRequest;
  const getSmartTransactionFeeEstimatesMock: jest.MockedFn<
    () => Promise<GetSmartTransactionFeeEstimatesResponse>
  > = jest.fn();

  beforeEach(() => {
    jest.resetAllMocks();

    request = {
      ethQuery: {} as EthQuery,
      getGasFeeControllerEstimates: jest.fn(),
      getSmartTransactionFeeEstimates: getSmartTransactionFeeEstimatesMock,
      transactionMeta: TRANSACTION_META_MOCK as TransactionMeta,
    };
  });

  describe('matchesTransaction', () => {
    it('returns true if transaction is a smart transaction', () => {
      const flow = new SmartTransactionGasFeeFlow();

      expect(flow.matchesTransaction(TRANSACTION_META_MOCK)).toBe(true);
    });

    it('returns false if transaction is not a smart transaction', () => {
      const flow = new SmartTransactionGasFeeFlow();
      const nonSmartTransaction = {
        ...TRANSACTION_META_MOCK,
        isSmartTransaction: false,
      };

      expect(flow.matchesTransaction(nonSmartTransaction)).toBe(false);
    });
  });

  describe('getGasFees', () => {
    it('returns calculated fees for a smart transaction', async () => {
      const flow = new SmartTransactionGasFeeFlow();
      getSmartTransactionFeeEstimatesMock.mockResolvedValue(
        SMART_TRANSACTION_GAS_FEES_API_RESPONSE_MOCK as GetSmartTransactionFeeEstimatesResponse,
      );

      const response = await flow.getGasFees(request);

      expect(response).toStrictEqual(RESPONSE_MOCK);
    });

    it('uses default flow if error', async () => {
      jest
        .spyOn(DefaultGasFeeFlow.prototype, 'getGasFees')
        .mockResolvedValue(RESPONSE_MOCK);

      const defaultGasFeeFlowGetGasFeesMock = jest.mocked(
        DefaultGasFeeFlow.prototype.getGasFees,
      );

      getSmartTransactionFeeEstimatesMock.mockRejectedValue(
        new Error('TestError'),
      );

      const flow = new SmartTransactionGasFeeFlow();
      const response = await flow.getGasFees(request);

      expect(response).toStrictEqual(RESPONSE_MOCK);

      expect(defaultGasFeeFlowGetGasFeesMock).toHaveBeenCalledTimes(1);
      expect(defaultGasFeeFlowGetGasFeesMock).toHaveBeenCalledWith(request);
    });

    it('throws if default flow fallback fails', async () => {
      jest
        .spyOn(DefaultGasFeeFlow.prototype, 'getGasFees')
        .mockRejectedValue(new Error('TestError'));

      const defaultGasFeeFlowGetGasFeesMock = jest.mocked(
        DefaultGasFeeFlow.prototype.getGasFees,
      );

      getSmartTransactionFeeEstimatesMock.mockRejectedValue(
        new Error('TestError'),
      );

      const flow = new SmartTransactionGasFeeFlow();
      const response = flow.getGasFees(request);

      await expect(response).rejects.toThrow('TestError');

      expect(defaultGasFeeFlowGetGasFeesMock).toHaveBeenCalledTimes(1);
      expect(defaultGasFeeFlowGetGasFeesMock).toHaveBeenCalledWith(request);
    });
  });
});
