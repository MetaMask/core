import type { GasFeeState } from '@metamask/gas-fee-controller';
import { GAS_ESTIMATE_TYPES } from '@metamask/gas-fee-controller';

import { CHAIN_IDS } from '../constants';
import type { TransactionControllerMessenger } from '../TransactionController';
import type {
  FeeMarketGasFeeEstimates,
  GasFeeFlowRequest,
  GasFeeFlowResponse,
  TransactionMeta,
} from '../types';
import {
  GasFeeEstimateLevel,
  GasFeeEstimateType,
  TransactionStatus,
} from '../types';
import { rpcRequest } from '../utils/provider';
import { DefaultGasFeeFlow } from './DefaultGasFeeFlow';
import { LineaGasFeeFlow } from './LineaGasFeeFlow';

jest.mock('../utils/provider', () => ({
  rpcRequest: jest.fn(),
}));

const TRANSACTION_META_MOCK: TransactionMeta = {
  id: '1',
  chainId: '0x123',
  networkClientId: 'testNetworkClientId',
  status: TransactionStatus.unapproved,
  time: 0,
  txParams: {
    from: '0x123',
  },
};

const LINEA_RESPONSE_MOCK = {
  baseFeePerGas: '0x111111111',
  priorityFeePerGas: '0x222222222',
};

const GAS_FEE_CONTROLLER_DATA_MOCK = {
  gasEstimateType: GAS_ESTIMATE_TYPES.FEE_MARKET,
  gasFeeEstimates: {},
} as GasFeeState;

const DEFAULT_RESPONSE_MOCK: GasFeeFlowResponse = {
  estimates: {
    type: GasFeeEstimateType.FeeMarket,
    low: {
      maxFeePerGas: '0x1',
      maxPriorityFeePerGas: '0x2',
    },
    medium: {
      maxFeePerGas: '0x3',
      maxPriorityFeePerGas: '0x4',
    },
    high: {
      maxFeePerGas: '0x5',
      maxPriorityFeePerGas: '0x6',
    },
  },
};

describe('LineaGasFeeFlow', () => {
  const rpcRequestMock = jest.mocked(rpcRequest);

  let request: GasFeeFlowRequest;

  beforeEach(() => {
    request = {
      gasFeeControllerData: GAS_FEE_CONTROLLER_DATA_MOCK,
      messenger: {} as TransactionControllerMessenger,
      transactionMeta: TRANSACTION_META_MOCK,
    } as GasFeeFlowRequest;

    rpcRequestMock.mockResolvedValue(LINEA_RESPONSE_MOCK);
  });

  describe('matchesTransaction', () => {
    it.each([
      ['linea mainnet', CHAIN_IDS.LINEA_MAINNET],
      ['linea goerli testnet', CHAIN_IDS.LINEA_GOERLI],
      ['linea sepolia testnet', CHAIN_IDS.LINEA_SEPOLIA],
    ])('returns true if chain ID is %s', (_title, chainId) => {
      const flow = new LineaGasFeeFlow();

      const transaction = {
        ...TRANSACTION_META_MOCK,
        chainId,
      };

      expect(
        flow.matchesTransaction({
          transactionMeta: transaction,
          messenger: {} as TransactionControllerMessenger,
        }),
      ).toBe(true);
    });
  });

  describe('getGasFees', () => {
    it('returns priority fees using custom RPC method and static priority fee multipliers', async () => {
      const flow = new LineaGasFeeFlow();
      const response = await flow.getGasFees(request);
      const estimates = response.estimates as FeeMarketGasFeeEstimates;

      const priorityFees = Object.values(GasFeeEstimateLevel).map(
        (level) => estimates[level].maxPriorityFeePerGas,
      );

      expect(priorityFees).toStrictEqual([
        LINEA_RESPONSE_MOCK.priorityFeePerGas,
        '0x23a3d70a3',
        '0x25658bf25',
      ]);

      expect(rpcRequestMock).toHaveBeenCalledTimes(1);
      expect(rpcRequestMock).toHaveBeenCalledWith({
        messenger: request.messenger,
        networkClientId: request.transactionMeta.networkClientId,
        method: 'linea_estimateGas',
        params: [
          {
            from: request.transactionMeta.txParams.from,
          },
        ],
      });
    });

    it('returns max fees using custom RPC method and static base fee multipliers', async () => {
      const flow = new LineaGasFeeFlow();
      const response = await flow.getGasFees(request);
      const estimates = response.estimates as FeeMarketGasFeeEstimates;

      const maxFees = Object.values(GasFeeEstimateLevel).map(
        (level) => estimates[level].maxFeePerGas,
      );

      expect(maxFees).toStrictEqual([
        '0x333333333',
        '0x3a7ae1479',
        '0x42428f5c1',
      ]);
    });

    it('uses default flow if error', async () => {
      jest
        .spyOn(DefaultGasFeeFlow.prototype, 'getGasFees')
        .mockResolvedValue(DEFAULT_RESPONSE_MOCK);

      const defaultGasFeeFlowGetGasFeesMock = jest.mocked(
        DefaultGasFeeFlow.prototype.getGasFees,
      );

      rpcRequestMock.mockRejectedValue(new Error('TestError'));

      const flow = new LineaGasFeeFlow();
      const response = await flow.getGasFees(request);

      expect(response).toStrictEqual(DEFAULT_RESPONSE_MOCK);

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

      rpcRequestMock.mockRejectedValue(new Error('error'));

      const flow = new LineaGasFeeFlow();
      const response = flow.getGasFees(request);

      await expect(response).rejects.toThrow('TestError');

      expect(defaultGasFeeFlowGetGasFeesMock).toHaveBeenCalledTimes(1);
      expect(defaultGasFeeFlowGetGasFeesMock).toHaveBeenCalledWith(request);
    });
  });
});
