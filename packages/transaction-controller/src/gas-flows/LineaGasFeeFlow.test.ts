import { query } from '@metamask/controller-utils';
import type { GasFeeState } from '@metamask/gas-fee-controller';
import { GAS_ESTIMATE_TYPES } from '@metamask/gas-fee-controller';

import { CHAIN_IDS } from '../constants';
import type { GasFeeFlowRequest, TransactionMeta } from '../types';
import { TransactionStatus } from '../types';
import { LineaGasFeeFlow } from './LineaGasFeeFlow';

jest.mock('@metamask/controller-utils', () => ({
  ...jest.requireActual('@metamask/controller-utils'),
  query: jest.fn(),
}));

const TRANSACTION_META_MOCK: TransactionMeta = {
  id: '1',
  chainId: '123',
  status: TransactionStatus.unapproved,
  time: 0,
  transaction: {
    from: '0x123',
  },
};

const LINEA_RESPONSE_MOCK = {
  baseFeePerGas: '0x1',
  priorityFeePerGas: '0x2',
};

const GAS_FEE_CONTROLLER_RESPONSE_MOCK: GasFeeState = {
  gasEstimateType: GAS_ESTIMATE_TYPES.FEE_MARKET,
  gasFeeEstimates: {
    low: {
      suggestedMaxFeePerGas: '1',
      suggestedMaxPriorityFeePerGas: '2',
    },
    medium: {
      suggestedMaxFeePerGas: '3',
      suggestedMaxPriorityFeePerGas: '4',
    },
    high: {
      suggestedMaxFeePerGas: '5',
      suggestedMaxPriorityFeePerGas: '6',
    },
  },
} as GasFeeState;

describe('LineaGasFeeFlow', () => {
  const queryMock = jest.mocked(query);

  let request: GasFeeFlowRequest;
  let getGasFeeControllerEstimatesMock: jest.MockedFn<
    () => Promise<GasFeeState>
  >;

  beforeEach(() => {
    jest.resetAllMocks();

    getGasFeeControllerEstimatesMock = jest.fn();
    getGasFeeControllerEstimatesMock.mockResolvedValue(
      GAS_FEE_CONTROLLER_RESPONSE_MOCK,
    );

    request = {
      ethQuery: {},
      getGasFeeControllerEstimates: getGasFeeControllerEstimatesMock,
      transactionMeta: TRANSACTION_META_MOCK,
    };

    queryMock.mockResolvedValue(LINEA_RESPONSE_MOCK);
  });

  describe('matchesTransaction', () => {
    it.each([
      ['linea mainnet', CHAIN_IDS.LINEA_MAINNET],
      ['linea testnet', CHAIN_IDS.LINEA_GOERLI],
    ])('returns true if chain ID is %s', (_title, chainId) => {
      const flow = new LineaGasFeeFlow();

      const transaction = {
        ...TRANSACTION_META_MOCK,
        chainId,
      };

      expect(flow.matchesTransaction(transaction)).toBe(true);
    });
  });

  describe('getGasFees', () => {
    it('returns priority fees using custom RPC method and gas fee controller estimate differences', async () => {
      const flow = new LineaGasFeeFlow();
      const response = await flow.getGasFees(request);

      expect(
        Object.values(response.estimates).map(
          (level) => level.maxPriorityFeePerGas,
        ),
      ).toStrictEqual(['0x2', '0x77359402', '0xee6b2802']);
    });

    it('returns max fees using custom RPC method and base fee multipliers', async () => {
      const flow = new LineaGasFeeFlow();
      const response = await flow.getGasFees(request);

      expect(
        Object.values(response.estimates).map((level) => level.maxFeePerGas),
      ).toStrictEqual(['0x3', '0x77359403', '0xee6b2803']);
    });

    it('throws if gas fee estimate type is not fee market', async () => {
      getGasFeeControllerEstimatesMock.mockResolvedValue({
        ...GAS_FEE_CONTROLLER_RESPONSE_MOCK,
        gasEstimateType: GAS_ESTIMATE_TYPES.LEGACY,
      } as GasFeeState);

      const flow = new LineaGasFeeFlow();
      const response = flow.getGasFees(request);

      await expect(response).rejects.toThrow('No gas fee estimates available');
    });
  });
});
