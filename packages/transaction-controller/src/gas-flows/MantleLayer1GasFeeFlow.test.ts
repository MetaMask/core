import { TransactionFactory } from '@ethereumjs/tx';
import type { TypedTransaction } from '@ethereumjs/tx';
import { Contract } from '@ethersproject/contracts';
import type { Provider } from '@metamask/network-controller';
import { add0x } from '@metamask/utils';
import type { Hex } from '@metamask/utils';
import BN from 'bn.js';

import { CHAIN_IDS } from '../constants';
import type { TransactionControllerMessenger } from '../TransactionController';
import { TransactionStatus } from '../types';
import type { Layer1GasFeeFlowRequest, TransactionMeta } from '../types';
import { bnFromHex, padHexToEvenLength } from '../utils/utils';
import { MantleLayer1GasFeeFlow } from './MantleLayer1GasFeeFlow';

jest.mock('@ethersproject/contracts', () => ({
  Contract: jest.fn(),
}));

jest.mock('@ethersproject/providers');

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
  const contractMock = jest.mocked(Contract);
  const contractGetL1FeeMock: jest.MockedFn<() => Promise<BN>> = jest.fn();
  const contractGetOperatorFeeMock: jest.MockedFn<() => Promise<BN>> =
    jest.fn();
  const contractTokenRatioMock: jest.MockedFn<() => Promise<BN>> = jest.fn();

  let request: Layer1GasFeeFlowRequest;

  beforeEach(() => {
    request = {
      provider: {} as Provider,
      transactionMeta: TRANSACTION_META_MOCK,
    };

    contractMock.mockClear();
    contractGetL1FeeMock.mockClear();
    contractGetOperatorFeeMock.mockClear();
    contractTokenRatioMock.mockClear();

    contractGetL1FeeMock.mockResolvedValue(bnFromHex(L1_FEE_MOCK));
    contractGetOperatorFeeMock.mockResolvedValue(new BN(0));
    contractTokenRatioMock.mockResolvedValue(TOKEN_RATIO_MOCK);

    // The base class creates a contract first (for getL1Fee/getOperatorFee),
    // then transformOracleFee creates a second contract (for tokenRatio).
    // Both use the same mock constructor.
    contractMock.mockReturnValue({
      getL1Fee: contractGetL1FeeMock,
      getOperatorFee: contractGetOperatorFeeMock,
      tokenRatio: contractTokenRatioMock,
    } as unknown as Contract);
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

      contractGetOperatorFeeMock.mockResolvedValueOnce(
        bnFromHex(OPERATOR_FEE_MOCK),
      );

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

      expect(contractTokenRatioMock).toHaveBeenCalledTimes(1);
      expect(contractGetOperatorFeeMock).toHaveBeenCalledTimes(1);
      expect(response).toStrictEqual({
        layer1Fee: add0x(padHexToEvenLength(expectedTotal.toString(16))),
      });
    });

    it('returns converted L1 fee when no gasUsed (no operator fee)', async () => {
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

      expect(contractGetOperatorFeeMock).not.toHaveBeenCalled();
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

      contractGetOperatorFeeMock.mockRejectedValueOnce(new Error('revert'));

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
      contractTokenRatioMock.mockRejectedValue(new Error('error'));

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

      contractGetOperatorFeeMock.mockResolvedValueOnce(
        bnFromHex(OPERATOR_FEE_MOCK),
      );

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

      expect(contractTokenRatioMock).toHaveBeenCalledTimes(1);
      expect(contractGetOperatorFeeMock).toHaveBeenCalledTimes(1);
      expect(response).toStrictEqual({
        layer1Fee: add0x(padHexToEvenLength(expectedTotal.toString(16))),
      });
    });
  });
});
