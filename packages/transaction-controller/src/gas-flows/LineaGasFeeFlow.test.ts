import type { GasFeeState } from '@metamask/gas-fee-controller';
import { GAS_ESTIMATE_TYPES } from '@metamask/gas-fee-controller';

import { CHAIN_IDS } from '../constants.js';
import type { TransactionControllerMessenger } from '../TransactionController.js';
import type {
  FeeMarketGasFeeEstimates,
  GasFeeFlowRequest,
  GasFeeFlowResponse,
  TransactionMeta,
} from '../types.js';
import {
  GasFeeEstimateLevel,
  GasFeeEstimateType,
  TransactionStatus,
} from '../types.js';
import { rpcRequest } from '../utils/provider.js';
import { DefaultGasFeeFlow } from './DefaultGasFeeFlow.js';
import { LineaGasFeeFlow } from './LineaGasFeeFlow.js';

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
        '0x23d70a3d6',
        '0x258bf258b',
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
        '0x3ae147ae0',
        '0x428f5c28e',
      ]);
    });

    it('applies fractional multipliers without integer truncation', async () => {
      // Values chosen so a naive `BN.muln(1.35)` truncates to the wrong
      // integer per 26-bit word instead of throwing - proving the
      // implementation multiplies via an arbitrary-precision path.
      const basePerGas = 30_000_000_000n; // 30 gwei
      const priorityPerGas = 1_000_000_000n; // 1 gwei

      rpcRequestMock.mockResolvedValue({
        baseFeePerGas: `0x${basePerGas.toString(16)}`,
        priorityFeePerGas: `0x${priorityPerGas.toString(16)}`,
      });

      const flow = new LineaGasFeeFlow();
      const response = await flow.getGasFees(request);
      const estimates = response.estimates as FeeMarketGasFeeEstimates;

      expect(BigInt(estimates.medium.maxPriorityFeePerGas)).toBe(
        (priorityPerGas * 105n) / 100n,
      );
      expect(BigInt(estimates.high.maxPriorityFeePerGas)).toBe(
        (priorityPerGas * 110n) / 100n,
      );
      expect(BigInt(estimates.medium.maxFeePerGas)).toBe(
        (basePerGas * 135n) / 100n + (priorityPerGas * 105n) / 100n,
      );
      expect(BigInt(estimates.high.maxFeePerGas)).toBe(
        (basePerGas * 170n) / 100n + (priorityPerGas * 110n) / 100n,
      );
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
