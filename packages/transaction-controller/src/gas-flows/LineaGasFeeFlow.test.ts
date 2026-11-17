import type { GasFeeState } from '@metamask/gas-fee-controller';
import { GAS_ESTIMATE_TYPES } from '@metamask/gas-fee-controller';
import { beforeEach, describe, expect, it, vi } from 'vitest';

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

vi.mock('../utils/provider', () => ({
  rpcRequest: vi.fn(),
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
  const rpcRequestMock = vi.mocked(rpcRequest);

  let request: GasFeeFlowRequest;

  beforeEach(() => {
    request = {
      gasFeeControllerData: GAS_FEE_CONTROLLER_DATA_MOCK,
      messenger: {} as TransactionControllerMessenger,
      transactionMeta: TRANSACTION_META_MOCK,
    };

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

    it.each([
      [30_000_000_000n, 1_000_000_000n],
      [3n, 19n],
      [0n, 0n],
      [2n ** 26n - 1n, 2n ** 26n - 1n],
      [2n ** 26n, 2n ** 26n],
      [2n ** 26n + 1n, 2n ** 26n + 1n],
      [2n ** 52n + 1n, 2n ** 52n + 1n],
      [2n ** 53n + 1n, 2n ** 53n + 1n],
    ])(
      'applies fractional multipliers to base %s and priority %s',
      async (base, priority) => {
        rpcRequestMock.mockResolvedValue({
          baseFeePerGas: `0x${base.toString(16)}`,
          priorityFeePerGas: `0x${priority.toString(16)}`,
        });

        const { estimates } = await new LineaGasFeeFlow().getGasFees(request);
        const fees = estimates as FeeMarketGasFeeEstimates;

        for (const [level, baseNumerator, priorityNumerator] of [
          [GasFeeEstimateLevel.Low, 100n, 100n],
          [GasFeeEstimateLevel.Medium, 135n, 105n],
          [GasFeeEstimateLevel.High, 170n, 110n],
        ] as const) {
          const expectedPriority = (priority * priorityNumerator) / 100n;
          const expectedBase = (base * baseNumerator) / 100n;

          expect(BigInt(fees[level].maxPriorityFeePerGas)).toBe(
            expectedPriority,
          );
          expect(BigInt(fees[level].maxFeePerGas)).toBe(
            expectedBase + expectedPriority,
          );
        }
      },
    );

    it('uses default flow if error', async () => {
      vi.spyOn(DefaultGasFeeFlow.prototype, 'getGasFees').mockResolvedValue(
        DEFAULT_RESPONSE_MOCK,
      );

      const defaultGasFeeFlowGetGasFeesMock = vi.mocked(
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
      vi.spyOn(DefaultGasFeeFlow.prototype, 'getGasFees').mockRejectedValue(
        new Error('TestError'),
      );

      const defaultGasFeeFlowGetGasFeesMock = vi.mocked(
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
