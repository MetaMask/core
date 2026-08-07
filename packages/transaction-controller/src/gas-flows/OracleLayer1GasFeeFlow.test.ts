import type { TypedTransaction } from '@ethereumjs/tx';
import { TransactionFactory } from '@ethereumjs/tx';
import { Interface } from '@ethersproject/abi';
import type { Provider } from '@metamask/network-controller';
import { add0x } from '@metamask/utils';
import type { Hex } from '@metamask/utils';
import BN from 'bn.js';

import { CHAIN_IDS } from '../constants.js';
import type { TransactionControllerMessenger } from '../TransactionController.js';
import { TransactionStatus } from '../types.js';
import type { Layer1GasFeeFlowRequest, TransactionMeta } from '../types.js';
import { rpcRequest } from '../utils/provider.js';
import { bnFromHex, padHexToEvenLength } from '../utils/utils.js';
import { OracleLayer1GasFeeFlow } from './OracleLayer1GasFeeFlow.js';
import { GasEstimationStrategy } from '../../../config-registry-controller/src/config-registry-api-service/types.js';

jest.mock('../utils/provider');

jest.mock('../utils/layer1-gas-fee-flow', () => ({
  buildUnserializedTransaction: jest.fn(),
}));

const ORACLE_INTERFACE = new Interface([
  'function getL1Fee(bytes _data)',
  'function getOperatorFee(uint256 _gasUsed)',
]);

const GET_L1_FEE_SELECTOR = ORACLE_INTERFACE.getSighash('getL1Fee');

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

const MESSENGER_MOCK = {} as TransactionControllerMessenger;

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

/**
 * Extracts the call object from a mocked rpcRequest invocation.
 *
 * @param call - The arguments of a single rpcRequest call.
 * @returns The `eth_call` transaction object.
 */
function getEthCallObject(call: Parameters<typeof rpcRequest>): {
  to: Hex;
  data: Hex;
} {
  return (call[0].params as [{ to: Hex; data: Hex }, string])[0];
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
  const rpcRequestMock = jest.mocked(rpcRequest);
  const getL1FeeMock: jest.MockedFn<() => Promise<unknown>> = jest.fn();
  const getOperatorFeeMock: jest.MockedFn<() => Promise<unknown>> = jest.fn();

  let request: Layer1GasFeeFlowRequest;

  beforeEach(() => {
    request = {
      messenger: MESSENGER_MOCK,
      provider: {} as Provider,
      transactionMeta: TRANSACTION_META_MOCK,
    };

    rpcRequestMock.mockClear();
    getL1FeeMock.mockClear();
    getOperatorFeeMock.mockClear();

    getL1FeeMock.mockResolvedValue(LAYER_1_FEE_MOCK);
    getOperatorFeeMock.mockResolvedValue('0x0');

    rpcRequestMock.mockImplementation(async (args) => {
      const { data } = getEthCallObject([args]);

      if (data.startsWith(GET_L1_FEE_SELECTOR)) {
        return await getL1FeeMock();
      }

      return await getOperatorFeeMock();
    });
  });

  describe('getLayer1GasFee', () => {
    it('returns value from oracle eth_call', async () => {
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

      expect(rpcRequestMock).toHaveBeenCalledTimes(1);
      expect(rpcRequestMock).toHaveBeenCalledWith({
        messenger: MESSENGER_MOCK,
        networkClientId: TRANSACTION_META_MOCK.networkClientId,
        method: 'eth_call',
        params: [
          {
            to: ORACLE_ADDRESS_MOCK,
            data: ORACLE_INTERFACE.encodeFunctionData('getL1Fee', [
              serializedTransactionMock,
            ]),
          },
          'latest',
        ],
      });
      expect(getOperatorFeeMock).not.toHaveBeenCalled();
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
      expect(getOperatorFeeMock).not.toHaveBeenCalled();
    });

    describe('throws', () => {
      it('if getL1Fee fails', async () => {
        getL1FeeMock.mockRejectedValue(new Error('error'));

        const flow = new MockOracleLayer1GasFeeFlow(false);

        await expect(flow.getLayer1Fee(request)).rejects.toThrow(
          'Failed to get oracle layer 1 gas fee',
        );
      });

      it('if getL1Fee returns undefined', async () => {
        getL1FeeMock.mockResolvedValue(undefined);

        const flow = new MockOracleLayer1GasFeeFlow(false);

        await expect(flow.getLayer1Fee(request)).rejects.toThrow(
          'Failed to get oracle layer 1 gas fee',
        );
      });

      it('if getL1Fee returns empty result', async () => {
        getL1FeeMock.mockResolvedValue('0x');

        const flow = new MockOracleLayer1GasFeeFlow(false);

        await expect(flow.getLayer1Fee(request)).rejects.toThrow(
          'Failed to get oracle layer 1 gas fee',
        );
      });
    });

    it('uses the registry network configuration oracle address when subclasses do not override helpers', async () => {
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

      const flow = new DefaultOracleLayer1GasFeeFlow({
        getRegistryGasStrategyForChain: (): GasEstimationStrategy => ({
          type: 'l1Oracle',
          l1OracleAddress: '0x123',
        }),
      });
      await flow.getLayer1Fee(request);

      expect(rpcRequestMock).toHaveBeenCalledTimes(1);
      const { to } = getEthCallObject(rpcRequestMock.mock.calls[0]);
      expect(to).toBe('0x123');
      expect(typedTransactionMock.sign).not.toHaveBeenCalled();
    });

    it('uses default oracle configuration when subclasses do not override helpers and registry config is undefined', async () => {
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

      expect(rpcRequestMock).toHaveBeenCalledTimes(1);
      const { to } = getEthCallObject(rpcRequestMock.mock.calls[0]);
      expect(to).toBe(DEFAULT_GAS_PRICE_ORACLE_ADDRESS);
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

      getOperatorFeeMock.mockResolvedValueOnce(OPERATOR_FEE_MOCK);

      const flow = new MockOracleLayer1GasFeeFlow(false);
      const response = await flow.getLayer1Fee(request);

      expect(getOperatorFeeMock).toHaveBeenCalledTimes(1);
      expect(rpcRequestMock).toHaveBeenCalledWith({
        messenger: MESSENGER_MOCK,
        networkClientId: TRANSACTION_META_MOCK.networkClientId,
        method: 'eth_call',
        params: [
          {
            to: ORACLE_ADDRESS_MOCK,
            data: ORACLE_INTERFACE.encodeFunctionData('getOperatorFee', [
              gasUsed,
            ]),
          },
          'latest',
        ],
      });
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

      getOperatorFeeMock.mockRejectedValueOnce(new Error('revert'));

      const flow = new MockOracleLayer1GasFeeFlow(false);
      const response = await flow.getLayer1Fee(request);

      expect(getOperatorFeeMock).toHaveBeenCalledTimes(1);
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

      getOperatorFeeMock.mockResolvedValueOnce(undefined);

      const flow = new MockOracleLayer1GasFeeFlow(false);
      const response = await flow.getLayer1Fee(request);

      expect(getOperatorFeeMock).toHaveBeenCalledTimes(1);
      expect(response).toStrictEqual({
        layer1Fee: LAYER_1_FEE_MOCK,
      });
    });

    it('applies transformOracleFee before adding operator fee', async () => {
      const gasUsed = '0x5208';
      request = {
        ...request,
        transactionMeta: {
          ...request.transactionMeta,
          gasUsed,
        },
      };

      const multiplier = new BN(2);
      getOperatorFeeMock.mockResolvedValueOnce(OPERATOR_FEE_MOCK);

      jest
        .spyOn(TransactionFactory, 'fromTxData')
        .mockReturnValueOnce(
          createMockTypedTransaction(
            Buffer.from(SERIALIZED_TRANSACTION_MOCK, 'hex'),
          ),
        );

      class TransformingFlow extends OracleLayer1GasFeeFlow {
        async matchesTransaction(): Promise<boolean> {
          return true;
        }

        protected override async transformOracleFee(
          oracleFee: BN,
        ): Promise<BN> {
          return oracleFee.mul(multiplier);
        }

        protected override getOracleAddressForChain(): Hex {
          return ORACLE_ADDRESS_MOCK;
        }
      }

      const flow = new TransformingFlow();
      const response = await flow.getLayer1Fee(request);

      const expectedTransformed = bnFromHex(LAYER_1_FEE_MOCK).mul(multiplier);
      const expectedTotal = expectedTransformed.add(
        bnFromHex(OPERATOR_FEE_MOCK),
      );

      expect(response).toStrictEqual({
        layer1Fee: add0x(padHexToEvenLength(expectedTotal.toString(16))),
      });
    });
  });
});
