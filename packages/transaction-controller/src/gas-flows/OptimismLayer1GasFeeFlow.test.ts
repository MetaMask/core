import type { TypedTransaction } from '@ethereumjs/tx';
import { toBuffer } from '@ethereumjs/util';
import { Contract } from '@ethersproject/contracts';
import type EthQuery from '@metamask/eth-query';

import { CHAIN_IDS } from '../constants';
import type { Layer1GasFeeFlowRequest, TransactionMeta } from '../types';
import { TransactionStatus } from '../types';
import { buildUnserializedTransaction } from '../utils/layer1-gas-fee-flow';
import { OptimismLayer1GasFeeFlow } from './OptimismLayer1GasFeeFlow';

jest.mock('@ethersproject/contracts', () => ({
  Contract: jest.fn(),
}));

jest.mock('../utils/layer1-gas-fee-flow', () => ({
  buildUnserializedTransaction: jest.fn(),
}));

const TRANSACTION_META_MOCK: TransactionMeta = {
  id: '1',
  chainId: '0x123',
  status: TransactionStatus.unapproved,
  time: 0,
  txParams: {
    from: '0x123',
  },
};
const OPTIMISIM_LAYER_1_GAS_FEE_RESPONSE_MOCK = '0x123';
const TRANSACTION_SERIALIZED_BUFFER_MOCK = toBuffer('0x987654321');

describe('OptimismLayer1GasFeeFlow', () => {
  const contractMock = jest.mocked(Contract);
  const buildUnserializedTransactionMock = jest.mocked(
    buildUnserializedTransaction,
  );
  const serializeMock: jest.MockedFn<() => Buffer> = jest.fn();
  const contractGetL1FeeMock: jest.MockedFn<
    () => Promise<{ toHexString: () => string }>
  > = jest.fn();
  let request: Layer1GasFeeFlowRequest;

  beforeEach(() => {
    request = {
      ethQuery: {} as EthQuery,
      transactionMeta: TRANSACTION_META_MOCK,
    };

    contractGetL1FeeMock.mockResolvedValue({
      toHexString: () => OPTIMISIM_LAYER_1_GAS_FEE_RESPONSE_MOCK,
    });
    contractMock.mockReturnValue({
      getL1Fee: contractGetL1FeeMock,
    } as unknown as Contract);

    serializeMock.mockReturnValue(TRANSACTION_SERIALIZED_BUFFER_MOCK);
    buildUnserializedTransactionMock.mockReturnValue({
      serialize: serializeMock,
    } as unknown as TypedTransaction);
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

      expect(buildUnserializedTransactionMock).toHaveBeenCalledWith(
        TRANSACTION_META_MOCK,
      );

      expect(contractGetL1FeeMock).toHaveBeenCalledWith(
        TRANSACTION_SERIALIZED_BUFFER_MOCK,
      );

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
