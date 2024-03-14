import { query } from '@metamask/controller-utils';
import type EthQuery from '@metamask/eth-query';
import type { Hex } from '@metamask/utils';

import {
  TransactionStatus,
  type Layer1GasFeeFlow,
  type TransactionMeta,
} from '../types';
import { updateTransactionLayer1GasFee } from './layer1-gas-fee-flow';

jest.mock('@metamask/controller-utils', () => ({
  ...jest.requireActual('@metamask/controller-utils'),
  query: jest.fn(),
}));

const LAYER1_GAS_FEE_VALUE_MATCH_MOCK: Hex = '0x1';
const LAYER1_GAS_FEE_VALUE_UNMATCH_MOCK: Hex = '0x2';

/**
 * Creates a mock Layer1GasFeeFlow.
 * @param request - The request bag to create the mock
 * @param request.match - The value to return when calling matchesTransaction
 * @param request.layer1Fee - The value to return when calling getLayer1Fee
 * @returns The mock Layer1GasFeeFlow.
 */
function createLayer1GasFeeFlowMock({
  match,
  layer1Fee,
}: {
  match: boolean;
  layer1Fee: Hex;
}): jest.Mocked<Layer1GasFeeFlow> {
  return {
    matchesTransaction: jest.fn().mockReturnValue(match),
    getLayer1Fee: jest.fn().mockResolvedValue({ layer1Fee }),
  };
}

describe('updateTransactionLayer1GasFee', () => {
  const queryMock = query as unknown as EthQuery;
  let layer1GasFeeFlowsMock: jest.Mocked<Layer1GasFeeFlow[]>;
  let transactionMetaMock: TransactionMeta;

  beforeEach(() => {
    layer1GasFeeFlowsMock = [
      createLayer1GasFeeFlowMock({
        match: false,
        layer1Fee: LAYER1_GAS_FEE_VALUE_UNMATCH_MOCK,
      }),
      createLayer1GasFeeFlowMock({
        match: true,
        layer1Fee: LAYER1_GAS_FEE_VALUE_MATCH_MOCK,
      }),
    ];
    transactionMetaMock = {
      id: '1',
      chainId: '0x123',
      status: TransactionStatus.unapproved,
      time: 0,
      txParams: {
        from: '0x123',
      },
    };
  });

  it('updates given transaction layer1GasFee property', async () => {
    await updateTransactionLayer1GasFee({
      ethQuery: queryMock,
      layer1GasFeeFlows: layer1GasFeeFlowsMock,
      transactionMeta: transactionMetaMock,
    });

    const [unmatchingLayer1GasFeeFlow, matchingLayer1GasFeeFlow] =
      layer1GasFeeFlowsMock;

    expect(unmatchingLayer1GasFeeFlow.getLayer1Fee).not.toHaveBeenCalled();

    expect(matchingLayer1GasFeeFlow.getLayer1Fee).toHaveBeenCalledWith({
      ethQuery: queryMock,
      transactionMeta: transactionMetaMock,
    });

    expect(transactionMetaMock.layer1GasFee).toStrictEqual(
      LAYER1_GAS_FEE_VALUE_MATCH_MOCK,
    );
  });

  describe('does not set layer1GasFee property', () => {
    it('if error occurs while getting layer 1 gas fee', async () => {
      const [, matchingLayer1GasFeeFlow] = layer1GasFeeFlowsMock;

      const mockError = new Error('Error getting layer 1 gas fee');
      (matchingLayer1GasFeeFlow.getLayer1Fee as jest.Mock).mockRejectedValue(
        mockError,
      );

      await updateTransactionLayer1GasFee({
        ethQuery: queryMock,
        transactionMeta: transactionMetaMock,
        layer1GasFeeFlows: layer1GasFeeFlowsMock,
      });

      expect(matchingLayer1GasFeeFlow.getLayer1Fee).toHaveBeenCalledWith({
        ethQuery: queryMock,
        transactionMeta: transactionMetaMock,
      });
      expect(transactionMetaMock.layer1GasFee).toBeUndefined();
    });

    it('if no matching layer 1 gas fee flow', async () => {
      const unmatchingLayer1GasFeeFlow = createLayer1GasFeeFlowMock({
        match: false,
        layer1Fee: LAYER1_GAS_FEE_VALUE_UNMATCH_MOCK,
      });
      layer1GasFeeFlowsMock = [unmatchingLayer1GasFeeFlow];

      await updateTransactionLayer1GasFee({
        ethQuery: queryMock,
        transactionMeta: transactionMetaMock,
        layer1GasFeeFlows: layer1GasFeeFlowsMock,
      });

      expect(unmatchingLayer1GasFeeFlow.getLayer1Fee).not.toHaveBeenCalled();
    });
  });
});
