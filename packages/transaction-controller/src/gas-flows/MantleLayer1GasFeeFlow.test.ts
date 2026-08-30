import { TransactionFactory } from '@ethereumjs/tx';
import type { TypedTransaction } from '@ethereumjs/tx';
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
import { MantleLayer1GasFeeFlow } from './MantleLayer1GasFeeFlow.js';

jest.mock('../utils/provider');

const ORACLE_INTERFACE = new Interface([
  'function getL1Fee(bytes _data)',
  'function getOperatorFee(uint256 _gasUsed)',
  'function tokenRatio()',
]);

const GET_L1_FEE_SELECTOR = ORACLE_INTERFACE.getSighash('getL1Fee');
const TOKEN_RATIO_SELECTOR = ORACLE_INTERFACE.getSighash('tokenRatio');

const TRANSACTION_PARAMS_MOCK = {
  from: '0x123',
  gas: '0x1234',
};

const TRANSACTION_META_MOCK: TransactionMeta = {
  id: '1',
  chainId: CHAIN_IDS.MANTLE,
  networkClientId: 'testNetworkClientId',
  status: TransactionStatus.unapproved,
  time: 0,
  txParams: TRANSACTION_PARAMS_MOCK,
};

const TRANSACTION_META_TESTNET_MOCK: TransactionMeta = {
  id: '2',
  chainId: CHAIN_IDS.MANTLE_SEPOLIA,
  networkClientId: 'testNetworkClientId',
  status: TransactionStatus.unapproved,
  time: 0,
  txParams: TRANSACTION_PARAMS_MOCK,
};

const MESSENGER_MOCK = {} as TransactionControllerMessenger;

const SERIALIZED_TRANSACTION_MOCK = '0x1234';
// L1 fee in ETH (returned by oracle)
const L1_FEE_MOCK = '0x0de0b6b3a7640000'; // 1e18 (1 ETH in wei)
// tokenRatio is a raw multiplier (e.g., 3020 means 1 ETH L1 fee = 3020 MNT)
const TOKEN_RATIO_MOCK = new BN('3020');
const OPERATOR_FEE_MOCK = '0x2386f26fc10000'; // 0.01 ETH in wei

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

describe('MantleLayer1GasFeeFlow', () => {
  const rpcRequestMock = jest.mocked(rpcRequest);
  const getL1FeeMock: jest.MockedFn<() => Promise<unknown>> = jest.fn();
  const getOperatorFeeMock: jest.MockedFn<() => Promise<unknown>> = jest.fn();
  const tokenRatioMock: jest.MockedFn<() => Promise<unknown>> = jest.fn();

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
    tokenRatioMock.mockClear();

    getL1FeeMock.mockResolvedValue(L1_FEE_MOCK);
    getOperatorFeeMock.mockResolvedValue('0x0');
    tokenRatioMock.mockResolvedValue(add0x(TOKEN_RATIO_MOCK.toString(16)));

    rpcRequestMock.mockImplementation(async (args) => {
      const { data } = (args.params as [{ data: Hex }, string])[0];

      if (data.startsWith(GET_L1_FEE_SELECTOR)) {
        return await getL1FeeMock();
      }

      if (data.startsWith(TOKEN_RATIO_SELECTOR)) {
        return await tokenRatioMock();
      }

      return await getOperatorFeeMock();
    });
  });

  describe('matchesTransaction', () => {
    const messenger = {} as TransactionControllerMessenger;

    it('returns true if chain ID is Mantle', async () => {
      const flow = new MantleLayer1GasFeeFlow();

      expect(
        await flow.matchesTransaction({
          transactionMeta: TRANSACTION_META_MOCK,
          messenger,
        }),
      ).toBe(true);
    });

    it('returns true if chain ID is Mantle Sepolia', async () => {
      const flow = new MantleLayer1GasFeeFlow();

      expect(
        await flow.matchesTransaction({
          transactionMeta: TRANSACTION_META_TESTNET_MOCK,
          messenger,
        }),
      ).toBe(true);
    });

    it('returns false if chain ID is not Mantle', async () => {
      const flow = new MantleLayer1GasFeeFlow();

      expect(
        await flow.matchesTransaction({
          transactionMeta: {
            ...TRANSACTION_META_MOCK,
            chainId: CHAIN_IDS.MAINNET,
          },
          messenger,
        }),
      ).toBe(false);
    });
  });

  describe('getLayer1Fee', () => {
    it('multiplies L1 fee by tokenRatio before adding operator fee', async () => {
      const gasUsed = '0x5208';
      request = {
        ...request,
        transactionMeta: {
          ...request.transactionMeta,
          gasUsed,
        },
      };

      getOperatorFeeMock.mockResolvedValueOnce(OPERATOR_FEE_MOCK);

      jest
        .spyOn(TransactionFactory, 'fromTxData')
        .mockReturnValueOnce(
          createMockTypedTransaction(
            Buffer.from(SERIALIZED_TRANSACTION_MOCK, 'hex'),
          ),
        );

      const flow = new MantleLayer1GasFeeFlow();
      const response = await flow.getLayer1Fee(request);

      const expectedL1FeeInMnt = bnFromHex(L1_FEE_MOCK).mul(TOKEN_RATIO_MOCK);
      const expectedTotal = expectedL1FeeInMnt.add(
        bnFromHex(OPERATOR_FEE_MOCK),
      );

      expect(tokenRatioMock).toHaveBeenCalledTimes(1);
      expect(getOperatorFeeMock).toHaveBeenCalledTimes(1);
      expect(response).toStrictEqual({
        layer1Fee: add0x(padHexToEvenLength(expectedTotal.toString(16))),
      });
    });

    it('falls back to txParams.gas for operator fee when gasUsed is missing', async () => {
      getOperatorFeeMock.mockResolvedValueOnce(OPERATOR_FEE_MOCK);

      jest
        .spyOn(TransactionFactory, 'fromTxData')
        .mockReturnValueOnce(
          createMockTypedTransaction(
            Buffer.from(SERIALIZED_TRANSACTION_MOCK, 'hex'),
          ),
        );

      const flow = new MantleLayer1GasFeeFlow();
      const response = await flow.getLayer1Fee(request);

      const expectedL1FeeInMnt = bnFromHex(L1_FEE_MOCK).mul(TOKEN_RATIO_MOCK);
      const expectedTotal = expectedL1FeeInMnt.add(
        bnFromHex(OPERATOR_FEE_MOCK),
      );

      expect(getOperatorFeeMock).toHaveBeenCalledTimes(1);
      expect(rpcRequestMock).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'eth_call',
          params: [
            expect.objectContaining({
              data: ORACLE_INTERFACE.encodeFunctionData('getOperatorFee', [
                TRANSACTION_PARAMS_MOCK.gas,
              ]),
            }),
            'latest',
          ],
        }),
      );
      expect(response).toStrictEqual({
        layer1Fee: add0x(padHexToEvenLength(expectedTotal.toString(16))),
      });
    });

    it('falls back to txParams.gasLimit for operator fee when gasUsed and txParams.gas are missing', async () => {
      const gasLimit = '0x9999';
      request = {
        ...request,
        transactionMeta: {
          ...request.transactionMeta,
          txParams: {
            from: TRANSACTION_PARAMS_MOCK.from,
            gasLimit,
          },
        },
      };

      getOperatorFeeMock.mockResolvedValueOnce(OPERATOR_FEE_MOCK);

      jest
        .spyOn(TransactionFactory, 'fromTxData')
        .mockReturnValueOnce(
          createMockTypedTransaction(
            Buffer.from(SERIALIZED_TRANSACTION_MOCK, 'hex'),
          ),
        );

      const flow = new MantleLayer1GasFeeFlow();
      const response = await flow.getLayer1Fee(request);

      const expectedL1FeeInMnt = bnFromHex(L1_FEE_MOCK).mul(TOKEN_RATIO_MOCK);
      const expectedTotal = expectedL1FeeInMnt.add(
        bnFromHex(OPERATOR_FEE_MOCK),
      );

      expect(getOperatorFeeMock).toHaveBeenCalledTimes(1);
      expect(rpcRequestMock).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'eth_call',
          params: [
            expect.objectContaining({
              data: ORACLE_INTERFACE.encodeFunctionData('getOperatorFee', [
                gasLimit,
              ]),
            }),
            'latest',
          ],
        }),
      );
      expect(response).toStrictEqual({
        layer1Fee: add0x(padHexToEvenLength(expectedTotal.toString(16))),
      });
    });

    it('skips operator fee when no gasUsed, txParams.gas, or txParams.gasLimit is available', async () => {
      request = {
        ...request,
        transactionMeta: {
          ...request.transactionMeta,
          txParams: { from: TRANSACTION_PARAMS_MOCK.from },
        },
      };

      jest
        .spyOn(TransactionFactory, 'fromTxData')
        .mockReturnValueOnce(
          createMockTypedTransaction(
            Buffer.from(SERIALIZED_TRANSACTION_MOCK, 'hex'),
          ),
        );

      const flow = new MantleLayer1GasFeeFlow();
      const response = await flow.getLayer1Fee(request);

      const expectedL1FeeInMnt = bnFromHex(L1_FEE_MOCK).mul(TOKEN_RATIO_MOCK);

      expect(getOperatorFeeMock).not.toHaveBeenCalled();
      expect(response).toStrictEqual({
        layer1Fee: add0x(padHexToEvenLength(expectedL1FeeInMnt.toString(16))),
      });
    });

    it('defaults operator fee to zero when call fails', async () => {
      const gasUsed = '0x5208';
      request = {
        ...request,
        transactionMeta: {
          ...request.transactionMeta,
          gasUsed,
        },
      };

      getOperatorFeeMock.mockRejectedValueOnce(new Error('revert'));

      jest
        .spyOn(TransactionFactory, 'fromTxData')
        .mockReturnValueOnce(
          createMockTypedTransaction(
            Buffer.from(SERIALIZED_TRANSACTION_MOCK, 'hex'),
          ),
        );

      const flow = new MantleLayer1GasFeeFlow();
      const response = await flow.getLayer1Fee(request);

      const expectedL1FeeInMnt = bnFromHex(L1_FEE_MOCK).mul(TOKEN_RATIO_MOCK);

      expect(response).toStrictEqual({
        layer1Fee: add0x(padHexToEvenLength(expectedL1FeeInMnt.toString(16))),
      });
    });

    it('throws if tokenRatio call fails', async () => {
      tokenRatioMock.mockRejectedValue(new Error('error'));

      jest
        .spyOn(TransactionFactory, 'fromTxData')
        .mockReturnValueOnce(
          createMockTypedTransaction(
            Buffer.from(SERIALIZED_TRANSACTION_MOCK, 'hex'),
          ),
        );

      const flow = new MantleLayer1GasFeeFlow();

      await expect(flow.getLayer1Fee(request)).rejects.toThrow(
        'Failed to get oracle layer 1 gas fee',
      );
    });

    it('throws if tokenRatio call returns empty result', async () => {
      tokenRatioMock.mockResolvedValue('0x');

      jest
        .spyOn(TransactionFactory, 'fromTxData')
        .mockReturnValueOnce(
          createMockTypedTransaction(
            Buffer.from(SERIALIZED_TRANSACTION_MOCK, 'hex'),
          ),
        );

      const flow = new MantleLayer1GasFeeFlow();

      await expect(flow.getLayer1Fee(request)).rejects.toThrow(
        'Failed to get oracle layer 1 gas fee',
      );
    });

    it('uses default OP Stack oracle address for mainnet', () => {
      class TestableMantleLayer1GasFeeFlow extends MantleLayer1GasFeeFlow {
        exposeOracleAddress(chainId: Hex): Hex {
          return super.getOracleAddressForChain(chainId);
        }
      }

      const flow = new TestableMantleLayer1GasFeeFlow();
      expect(flow.exposeOracleAddress(CHAIN_IDS.MANTLE)).toBe(
        '0x420000000000000000000000000000000000000F',
      );
    });

    it('uses default OP Stack oracle address for Mantle Sepolia', () => {
      class TestableMantleLayer1GasFeeFlow extends MantleLayer1GasFeeFlow {
        exposeOracleAddress(chainId: Hex): Hex {
          return super.getOracleAddressForChain(chainId);
        }
      }

      const flow = new TestableMantleLayer1GasFeeFlow();
      expect(flow.exposeOracleAddress(CHAIN_IDS.MANTLE_SEPOLIA)).toBe(
        '0x420000000000000000000000000000000000000F',
      );
    });

    it('computes correct fee for Mantle Sepolia transactions', async () => {
      const gasUsed = '0x5208';
      request = {
        ...request,
        transactionMeta: {
          ...TRANSACTION_META_TESTNET_MOCK,
          gasUsed,
        },
      };

      getOperatorFeeMock.mockResolvedValueOnce(OPERATOR_FEE_MOCK);

      jest
        .spyOn(TransactionFactory, 'fromTxData')
        .mockReturnValueOnce(
          createMockTypedTransaction(
            Buffer.from(SERIALIZED_TRANSACTION_MOCK, 'hex'),
          ),
        );

      const flow = new MantleLayer1GasFeeFlow();
      const response = await flow.getLayer1Fee(request);

      const expectedL1FeeInMnt = bnFromHex(L1_FEE_MOCK).mul(TOKEN_RATIO_MOCK);
      const expectedTotal = expectedL1FeeInMnt.add(
        bnFromHex(OPERATOR_FEE_MOCK),
      );

      expect(tokenRatioMock).toHaveBeenCalledTimes(1);
      expect(getOperatorFeeMock).toHaveBeenCalledTimes(1);
      expect(response).toStrictEqual({
        layer1Fee: add0x(padHexToEvenLength(expectedTotal.toString(16))),
      });
    });
  });
});
