import { Contract } from '@ethersproject/contracts';
import type { Provider } from '@metamask/network-controller';

import { CHAIN_IDS } from '../constants';
import type { Layer1GasFeeFlowRequest, TransactionMeta } from '../types';
import { TransactionStatus } from '../types';
import { OptimismLayer1GasFeeFlow } from './OptimismLayer1GasFeeFlow';

jest.mock('@ethersproject/contracts', () => ({
  Contract: jest.fn(),
}));

jest.mock('../utils/layer1-gas-fee-flow', () => ({
  buildUnserializedTransaction: jest.fn(),
}));

jest.mock('@ethersproject/providers');

const TRANSACTION_META_MOCK: TransactionMeta = {
  id: '1',
  chainId: CHAIN_IDS.OPTIMISM,
  status: TransactionStatus.unapproved,
  time: 0,
  txParams: {
    from: '0x123',
  },
};
const OPTIMISIM_LAYER_1_GAS_FEE_RESPONSE_MOCK = '0x123';

describe('OptimismLayer1GasFeeFlow', () => {
  const contractMock = jest.mocked(Contract);
  const contractGetL1FeeMock: jest.MockedFn<
    () => Promise<{ toHexString: () => string }>
  > = jest.fn();
  let request: Layer1GasFeeFlowRequest;

  beforeEach(() => {
    request = {
      provider: {} as Provider,
      transactionMeta: TRANSACTION_META_MOCK,
    };

    contractGetL1FeeMock.mockResolvedValue({
      toHexString: () => OPTIMISIM_LAYER_1_GAS_FEE_RESPONSE_MOCK,
    });
    contractMock.mockReturnValue({
      getL1Fee: contractGetL1FeeMock,
    } as unknown as Contract);
  });

  describe('matchesTransaction', () => {
    it.each([
      ['Optimisim mainnet', CHAIN_IDS.OPTIMISM],
      ['Optimisim testnet', CHAIN_IDS.OPTIMISM_TESTNET],
    ])('returns true if chain ID is %s', (_title, chainId) => {
      const flow = new OptimismLayer1GasFeeFlow();

      const transaction = {
        ...TRANSACTION_META_MOCK,
        chainId,
      };

      expect(flow.matchesTransaction(transaction)).toBe(true);
    });
  });

  describe('getLayer1GasFee', () => {
    it('returns layer 1 gas fee', async () => {
      const flow = new OptimismLayer1GasFeeFlow();
      const response = await flow.getLayer1Fee(request);

      expect(contractGetL1FeeMock).toHaveBeenCalledTimes(1);

      expect(response).toStrictEqual({
        layer1Fee: OPTIMISIM_LAYER_1_GAS_FEE_RESPONSE_MOCK,
      });
    });

    it('throws if getL1Fee fails', async () => {
      contractGetL1FeeMock.mockRejectedValue(new Error('error'));

      const flow = new OptimismLayer1GasFeeFlow();
      await expect(flow.getLayer1Fee(request)).rejects.toThrow(
        'Failed to get Optimism layer 1 gas fee',
      );
    });
  });
});
