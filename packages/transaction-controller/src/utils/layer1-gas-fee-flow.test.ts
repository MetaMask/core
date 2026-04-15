import type { Provider } from '@metamask/network-controller';
import type { Hex } from '@metamask/utils';

import type { TransactionControllerMessenger } from '../TransactionController';
import { TransactionStatus } from '../types';
import type { Layer1GasFeeFlow, TransactionMeta } from '../types';
import { updateTransactionLayer1GasFee } from './layer1-gas-fee-flow';
import { getProvider } from './provider';

jest.mock('@metamask/controller-utils', () => ({
  ...jest.requireActual('@metamask/controller-utils'),
  query: jest.fn(),
}));

jest.mock('./provider', () => ({
  ...jest.requireActual('./provider'),
  getProvider: jest.fn(),
}));

const LAYER1_GAS_FEE_VALUE_MATCH_MOCK: Hex = '0x1';
const LAYER1_GAS_FEE_VALUE_UNMATCH_MOCK: Hex = '0x2';

/**
 * Creates a mock Layer1GasFeeFlow.
 *
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
    matchesTransaction: jest.fn().mockResolvedValue(match),
    getLayer1Fee: jest.fn().mockResolvedValue({ layer1Fee }),
  };
}

describe('updateTransactionLayer1GasFee', () => {
  const getProviderMock = jest.mocked(getProvider);
  let layer1GasFeeFlowsMock: jest.Mocked<Layer1GasFeeFlow[]>;
  let providerMock: Provider;
  let transactionMetaMock: TransactionMeta;
  let messengerMock: TransactionControllerMessenger;

  beforeEach(() => {
    jest.resetAllMocks();

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

    providerMock = {} as Provider;

    transactionMetaMock = {
      id: '1',
      chainId: '0x123',
      networkClientId: 'testNetworkClientId',
      status: TransactionStatus.unapproved,
      time: 0,
      txParams: {
        from: '0x123',
      },
    };

    messengerMock = {} as TransactionControllerMessenger;

    getProviderMock.mockReturnValue(providerMock);
  });

  it('updates given transaction layer1GasFee property', async () => {
    await updateTransactionLayer1GasFee({
      layer1GasFeeFlows: layer1GasFeeFlowsMock,
      messenger: messengerMock,
      transactionMeta: transactionMetaMock,
    });

    const [unmatchingLayer1GasFeeFlow, matchingLayer1GasFeeFlow] =
      layer1GasFeeFlowsMock;

    expect(unmatchingLayer1GasFeeFlow.getLayer1Fee).not.toHaveBeenCalled();

    expect(getProviderMock).toHaveBeenCalledWith({
      messenger: messengerMock,
      networkClientId: transactionMetaMock.networkClientId,
    });

    expect(matchingLayer1GasFeeFlow.getLayer1Fee).toHaveBeenCalledWith({
      provider: providerMock,
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
        layer1GasFeeFlows: layer1GasFeeFlowsMock,
        messenger: messengerMock,
        transactionMeta: transactionMetaMock,
      });

      expect(matchingLayer1GasFeeFlow.getLayer1Fee).toHaveBeenCalledWith({
        provider: providerMock,
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
        layer1GasFeeFlows: layer1GasFeeFlowsMock,
        messenger: messengerMock,
        transactionMeta: transactionMetaMock,
      });

      expect(getProviderMock).not.toHaveBeenCalled();
      expect(unmatchingLayer1GasFeeFlow.getLayer1Fee).not.toHaveBeenCalled();
    });
  });
});
