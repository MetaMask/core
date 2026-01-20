import type { TypedTransaction } from '@ethereumjs/tx';
import { TransactionFactory } from '@ethereumjs/tx';
import { Contract } from '@ethersproject/contracts';
import type { Provider } from '@metamask/network-controller';
import { add0x } from '@metamask/utils';
import type { Hex } from '@metamask/utils';
import BN from 'bn.js';

import { OracleLayer1GasFeeFlow } from './OracleLayer1GasFeeFlow';
import { CHAIN_IDS } from '../constants';
import type { TransactionControllerMessenger } from '../TransactionController';
import { TransactionStatus } from '../types';
import type { Layer1GasFeeFlowRequest, TransactionMeta } from '../types';
import { bnFromHex, padHexToEvenLength } from '../utils/utils';

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
  networkClientId: 'testNetworkClientId',
  status: TransactionStatus.unapproved,
  time: 0,
  txParams: TRANSACTION_PARAMS_MOCK,
};

const SERIALIZED_TRANSACTION_MOCK = '0x1234';
const ORACLE_ADDRESS_MOCK = '0x5678' as Hex;
const LAYER_1_FEE_MOCK = '0x09abcd';
const OPERATOR_FEE_MOCK = '0x5';
const DEFAULT_GAS_PRICE_ORACLE_ADDRESS =
  '0x420000000000000000000000000000000000000F';

/**
 * Creates a mock TypedTransaction object.
 *
 * @param serializedBuffer - The buffer returned by the serialize method.
 * @returns The mock TypedTransaction object.
 */
function createMockTypedTransaction(
  serializedBuffer: Buffer,
): jest.Mocked<TypedTransaction> {
  const instance = {
    serialize: (): Buffer => serializedBuffer,
    sign: jest.fn(),
  };

  jest.spyOn(instance, 'sign').mockReturnValue(instance);

  return instance as unknown as jest.Mocked<TypedTransaction>;
}

class MockOracleLayer1GasFeeFlow extends OracleLayer1GasFeeFlow {
  readonly #sign: boolean;

  constructor(sign: boolean) {
    super();
    this.#sign = sign;
  }

  async matchesTransaction({
    transactionMeta: _transactionMeta,
    messenger: _messenger,
  }: {
    transactionMeta: TransactionMeta;
    messenger: TransactionControllerMessenger;
  }): Promise<boolean> {
    return true;
  }

  protected override getOracleAddressForChain(): Hex {
    return ORACLE_ADDRESS_MOCK;
  }

  protected override shouldSignTransaction(): boolean {
    return this.#sign;
  }
}

class DefaultOracleLayer1GasFeeFlow extends OracleLayer1GasFeeFlow {
  async matchesTransaction({
    transactionMeta: _transactionMeta,
    messenger: _messenger,
  }: {
    transactionMeta: TransactionMeta;
    messenger: TransactionControllerMessenger;
  }): Promise<boolean> {
    return true;
  }
}

describe('OracleLayer1GasFeeFlow', () => {
  const contractMock = jest.mocked(Contract);
  const contractGetL1FeeMock: jest.MockedFn<() => Promise<BN>> = jest.fn();
  const contractGetOperatorFeeMock: jest.MockedFn<() => Promise<BN>> =
    jest.fn();

  let request: Layer1GasFeeFlowRequest;

  beforeEach(() => {
    request = {
      provider: {} as Provider,
      transactionMeta: TRANSACTION_META_MOCK,
    };

    contractMock.mockClear();
    contractGetL1FeeMock.mockClear();
    contractGetOperatorFeeMock.mockClear();

    contractGetL1FeeMock.mockResolvedValue(bnFromHex(LAYER_1_FEE_MOCK));
    contractGetOperatorFeeMock.mockResolvedValue(new BN(0));

    contractMock.mockReturnValue({
      getL1Fee: contractGetL1FeeMock,
      getOperatorFee: contractGetOperatorFeeMock,
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

      const flow = new MockOracleLayer1GasFeeFlow(false);
      const response = await flow.getLayer1Fee(request);

      expect(response).toStrictEqual({
        layer1Fee: LAYER_1_FEE_MOCK,
      });

      expect(transactionFactoryMock).toHaveBeenCalledTimes(1);
      expect(transactionFactoryMock).toHaveBeenCalledWith(
        {
          from: TRANSACTION_PARAMS_MOCK.from,
          gas: TRANSACTION_PARAMS_MOCK.gas,
          gasLimit: TRANSACTION_PARAMS_MOCK.gas,
        },
        expect.anything(),
      );

      expect(contractGetL1FeeMock).toHaveBeenCalledTimes(1);
      expect(contractGetL1FeeMock).toHaveBeenCalledWith(
        serializedTransactionMock,
      );
      expect(contractGetOperatorFeeMock).not.toHaveBeenCalled();
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

      const flow = new MockOracleLayer1GasFeeFlow(true);
      const response = await flow.getLayer1Fee(request);

      expect(response).toStrictEqual({
        layer1Fee: LAYER_1_FEE_MOCK,
      });

      expect(typedTransactionMock.sign).toHaveBeenCalledTimes(1);
      expect(contractGetOperatorFeeMock).not.toHaveBeenCalled();
    });

    describe('throws', () => {
      it('if getL1Fee fails', async () => {
        contractGetL1FeeMock.mockRejectedValue(new Error('error'));

        const flow = new MockOracleLayer1GasFeeFlow(false);

        await expect(flow.getLayer1Fee(request)).rejects.toThrow(
          'Failed to get oracle layer 1 gas fee',
        );
      });

      it('if getL1Fee returns undefined', async () => {
        contractGetL1FeeMock.mockResolvedValue(
          undefined as unknown as ReturnType<typeof contractGetL1FeeMock>,
        );

        const flow = new MockOracleLayer1GasFeeFlow(false);

        await expect(flow.getLayer1Fee(request)).rejects.toThrow(
          'Failed to get oracle layer 1 gas fee',
        );
      });
    });

    it('uses default oracle configuration when subclasses do not override helpers', async () => {
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

      const flow = new DefaultOracleLayer1GasFeeFlow();
      await flow.getLayer1Fee(request);

      expect(contractMock).toHaveBeenCalledTimes(1);
      const [oracleAddress] = contractMock.mock.calls[0];
      expect(oracleAddress).toBe(DEFAULT_GAS_PRICE_ORACLE_ADDRESS);
      expect(typedTransactionMock.sign).not.toHaveBeenCalled();
    });

    it('adds operator fee when gas used is available', async () => {
      const gasUsed = '0x5208';
      request = {
        ...request,
        transactionMeta: {
          ...request.transactionMeta,
          gasUsed,
        },
      };

      contractGetOperatorFeeMock.mockResolvedValueOnce(
        bnFromHex(OPERATOR_FEE_MOCK),
      );

      const flow = new MockOracleLayer1GasFeeFlow(false);
      const response = await flow.getLayer1Fee(request);

      expect(contractGetOperatorFeeMock).toHaveBeenCalledTimes(1);
      expect(contractGetOperatorFeeMock).toHaveBeenCalledWith(gasUsed);
      expect(response).toStrictEqual({
        layer1Fee: add0x(
          padHexToEvenLength(
            bnFromHex(LAYER_1_FEE_MOCK)
              .add(bnFromHex(OPERATOR_FEE_MOCK))
              .toString(16),
          ),
        ),
      });
    });

    it('defaults operator fee to zero when call fails', async () => {
      const gasUsed = '0x1';
      request = {
        ...request,
        transactionMeta: {
          ...request.transactionMeta,
          gasUsed,
        },
      };

      contractGetOperatorFeeMock.mockRejectedValueOnce(new Error('revert'));

      const flow = new MockOracleLayer1GasFeeFlow(false);
      const response = await flow.getLayer1Fee(request);

      expect(contractGetOperatorFeeMock).toHaveBeenCalledTimes(1);
      expect(response).toStrictEqual({
        layer1Fee: LAYER_1_FEE_MOCK,
      });
    });

    it('defaults operator fee to zero when call returns undefined', async () => {
      const gasUsed = '0x2';
      request = {
        ...request,
        transactionMeta: {
          ...request.transactionMeta,
          gasUsed,
        },
      };

      contractGetOperatorFeeMock.mockResolvedValueOnce(
        undefined as unknown as BN,
      );

      const flow = new MockOracleLayer1GasFeeFlow(false);
      const response = await flow.getLayer1Fee(request);

      expect(contractGetOperatorFeeMock).toHaveBeenCalledTimes(1);
      expect(response).toStrictEqual({
        layer1Fee: LAYER_1_FEE_MOCK,
      });
    });
  });
});
