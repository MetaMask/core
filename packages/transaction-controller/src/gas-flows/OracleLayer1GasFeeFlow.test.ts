import type { TypedTransaction } from '@ethereumjs/tx';
import { TransactionFactory } from '@ethereumjs/tx';
import { Contract } from '@ethersproject/contracts';
import type { Provider } from '@metamask/network-controller';

import { CHAIN_IDS } from '../constants';
import type { Layer1GasFeeFlowRequest, TransactionMeta } from '../types';
import { TransactionStatus } from '../types';
import { OracleLayer1GasFeeFlow } from './OracleLayer1GasFeeFlow';

jest.mock('@ethersproject/contracts', () => ({
  Contract: jest.fn(),
}));

jest.mock('../utils/layer1-gas-fee-flow', () => ({
  buildUnserializedTransaction: jest.fn(),
}));

jest.mock('@ethersproject/providers');

const TRANSACTION_PARAMS_MOCK = {
  from: '0x123',
  gas: '0x1234',
};

const TRANSACTION_META_MOCK: TransactionMeta = {
  id: '1',
  chainId: CHAIN_IDS.OPTIMISM,
  status: TransactionStatus.unapproved,
  time: 0,
  txParams: TRANSACTION_PARAMS_MOCK,
};

const SERIALIZED_TRANSACTION_MOCK = '0x1234';
const ORACLE_ADDRESS_MOCK = '0x5678';
const LAYER_1_FEE_MOCK = '0x9ABCD';

/**
 * Creates a mock TypedTransaction object.
 * @param serializedBuffer - The buffer returned by the serialize method.
 * @returns The mock TypedTransaction object.
 */
function createMockTypedTransaction(serializedBuffer: Buffer) {
  const instance = {
    serialize: () => serializedBuffer,
    sign: jest.fn(),
  };

  jest.spyOn(instance, 'sign').mockReturnValue(instance);

  return instance as unknown as jest.Mocked<TypedTransaction>;
}

class MockOracleLayer1GasFeeFlow extends OracleLayer1GasFeeFlow {
  matchesTransaction(_transactionMeta: TransactionMeta): boolean {
    return true;
  }
}

describe('OracleLayer1GasFeeFlow', () => {
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
      toHexString: () => LAYER_1_FEE_MOCK,
    });

    contractMock.mockReturnValue({
      getL1Fee: contractGetL1FeeMock,
    } as unknown as Contract);
  });

  describe('getLayer1GasFee', () => {
    it('returns value from smart contract call', async () => {
      const serializedTransactionMock = Buffer.from(
        SERIALIZED_TRANSACTION_MOCK,
        'hex',
      );

      const transactionFactoryMock = jest
        .spyOn(TransactionFactory, 'fromTxData')
        .mockReturnValueOnce(
          createMockTypedTransaction(serializedTransactionMock),
        );

      const flow = new MockOracleLayer1GasFeeFlow(ORACLE_ADDRESS_MOCK, false);
      const response = await flow.getLayer1Fee(request);

      expect(response).toStrictEqual({
        layer1Fee: LAYER_1_FEE_MOCK,
      });

      expect(transactionFactoryMock).toHaveBeenCalledTimes(1);
      expect(transactionFactoryMock).toHaveBeenCalledWith(
        {
          from: TRANSACTION_PARAMS_MOCK.from,
          gasLimit: TRANSACTION_PARAMS_MOCK.gas,
        },
        expect.anything(),
      );

      expect(contractGetL1FeeMock).toHaveBeenCalledTimes(1);
      expect(contractGetL1FeeMock).toHaveBeenCalledWith(
        serializedTransactionMock,
      );
    });

    it('signs transaction with dummy key if supported by flow', async () => {
      const serializedTransactionMock = Buffer.from(
        SERIALIZED_TRANSACTION_MOCK,
        'hex',
      );

      const typedTransactionMock = createMockTypedTransaction(
        serializedTransactionMock,
      );

      jest
        .spyOn(TransactionFactory, 'fromTxData')
        .mockReturnValueOnce(typedTransactionMock);

      const flow = new MockOracleLayer1GasFeeFlow(ORACLE_ADDRESS_MOCK, true);
      const response = await flow.getLayer1Fee(request);

      expect(response).toStrictEqual({
        layer1Fee: LAYER_1_FEE_MOCK,
      });

      expect(typedTransactionMock.sign).toHaveBeenCalledTimes(1);
    });

    describe('throws', () => {
      it('if getL1Fee fails', async () => {
        contractGetL1FeeMock.mockRejectedValue(new Error('error'));

        const flow = new MockOracleLayer1GasFeeFlow(ORACLE_ADDRESS_MOCK, false);

        await expect(flow.getLayer1Fee(request)).rejects.toThrow(
          'Failed to get oracle layer 1 gas fee',
        );
      });

      it('if getL1Fee returns undefined', async () => {
        contractGetL1FeeMock.mockResolvedValue(
          undefined as unknown as ReturnType<typeof contractGetL1FeeMock>,
        );

        const flow = new MockOracleLayer1GasFeeFlow(ORACLE_ADDRESS_MOCK, false);

        await expect(flow.getLayer1Fee(request)).rejects.toThrow(
          'Failed to get oracle layer 1 gas fee',
        );
      });
    });
  });
});
