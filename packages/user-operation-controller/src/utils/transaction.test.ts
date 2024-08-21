import type { TransactionParams } from '../../../transaction-controller/src';
import {
  TransactionStatus,
  TransactionType,
  UserFeeLevel,
} from '../../../transaction-controller/src';
import { EMPTY_BYTES, VALUE_ZERO } from '../constants';
import type { UserOperation } from '../types';
import { UserOperationStatus, type UserOperationMetadata } from '../types';
import { getTransactionMetadata } from './transaction';

const USER_OPERATION_METADATA_MOCK: UserOperationMetadata = {
  id: 'testUserOperationId',
  status: UserOperationStatus.Submitted,
  transactionParams: {},
  userFeeLevel: UserFeeLevel.DAPP_SUGGESTED,
  userOperation: {},
} as UserOperationMetadata;

const ERROR_MOCK = {
  name: 'TestError',
  message: 'TestErrorMessage',
  stack: 'TestErrorStack',
  code: 'TestErrorCode',
  rpc: 'TestErrorRPC',
};

describe('transation', () => {
  describe('getTransactionMetadata', () => {
    it('returns undefined if no transactionParams', () => {
      expect(
        getTransactionMetadata({
          ...USER_OPERATION_METADATA_MOCK,
          transactionParams: null,
        }),
      ).toBeUndefined();
    });

    it('returns effectiveGasPrice as actualGasCost divided by actualGasUsed', () => {
      const metadata = {
        ...USER_OPERATION_METADATA_MOCK,
        actualGasCost: '0xA',
        actualGasUsed: '0x2',
      };

      const transactionMetadata = getTransactionMetadata(metadata);

      expect(transactionMetadata?.txReceipt?.effectiveGasPrice).toBe('0x5');
    });

    it('returns error matching user operation error', () => {
      const metadata = {
        ...USER_OPERATION_METADATA_MOCK,
        error: ERROR_MOCK,
        status: UserOperationStatus.Failed,
      };

      const transactionMetadata = getTransactionMetadata(metadata) as Record<
        string,
        unknown
      >;

      expect(transactionMetadata?.error).toStrictEqual(ERROR_MOCK);
    });

    it('returns status matching user operation status', () => {
      const metadata = {
        ...USER_OPERATION_METADATA_MOCK,
        status: UserOperationStatus.Signed,
      };

      const transactionMetadata = getTransactionMetadata(metadata);

      expect(transactionMetadata?.status).toBe(TransactionStatus.signed);
    });

    it('returns gas as sum of all gas values', () => {
      const metadata = {
        ...USER_OPERATION_METADATA_MOCK,
        userOperation: {
          preVerificationGas: '0x1',
          verificationGasLimit: '0x2',
          callGasLimit: '0x3',
        } as UserOperation,
      };

      const transactionMetadata = getTransactionMetadata(metadata);

      expect(transactionMetadata?.txParams?.gas).toBe('0x6');
    });

    it.each([
      'maxFeePerGas',
      'maxPriorityFeePerGas',
    ] as (keyof TransactionParams)[])(
      'returns %s as zero if paymaster data set',
      (propertyName) => {
        const metadata = {
          ...USER_OPERATION_METADATA_MOCK,
          userOperation: {
            paymasterAndData: '0x1',
          },
        } as UserOperationMetadata;

        const transactionMetadata = getTransactionMetadata(metadata);

        expect(transactionMetadata?.txParams?.[propertyName]).toBe(VALUE_ZERO);
      },
    );

    it.each([
      'maxFeePerGas',
      'maxPriorityFeePerGas',
    ] as (keyof TransactionParams)[])(
      'returns %s from user operation if paymaster data not set',
      (propertyName) => {
        const metadata = {
          ...USER_OPERATION_METADATA_MOCK,
          userOperation: {
            paymasterAndData: EMPTY_BYTES,
            [propertyName]: '0x1',
          },
        } as UserOperationMetadata;

        const transactionMetadata = getTransactionMetadata(metadata);

        expect(transactionMetadata?.txParams?.[propertyName]).toBe('0x1');
      },
    );

    it('returns nonce from user operation if set', () => {
      const metadata = {
        ...USER_OPERATION_METADATA_MOCK,
        userOperation: {
          nonce: '0x1',
        },
      } as UserOperationMetadata;

      const transactionMetadata = getTransactionMetadata(metadata);

      expect(transactionMetadata?.txParams?.nonce).toBe('0x1');
    });

    it('returns nonce as undefined if user operation nonce is empty bytes', () => {
      const metadata = {
        ...USER_OPERATION_METADATA_MOCK,
        userOperation: {
          nonce: EMPTY_BYTES,
        },
      } as UserOperationMetadata;

      const transactionMetadata = getTransactionMetadata(metadata);

      expect(transactionMetadata?.txParams?.nonce).toBeUndefined();
    });

    it('returns userFeeLevel from metadata if paymaster data not set', () => {
      const metadata = {
        ...USER_OPERATION_METADATA_MOCK,
        userOperation: {
          paymasterAndData: EMPTY_BYTES,
        },
      } as UserOperationMetadata;

      expect(getTransactionMetadata(metadata)?.userFeeLevel).toBe(
        UserFeeLevel.DAPP_SUGGESTED,
      );
    });

    it('returns userFeeLevel as custom if paymaster data set', () => {
      const metadata = {
        ...USER_OPERATION_METADATA_MOCK,
        userOperation: {
          paymasterAndData: '0x1',
        },
      } as UserOperationMetadata;

      expect(getTransactionMetadata(metadata)?.userFeeLevel).toBe(
        UserFeeLevel.CUSTOM,
      );
    });

    it('returns from as user operation sender', () => {
      const metadata = {
        ...USER_OPERATION_METADATA_MOCK,
        userOperation: {
          sender: '0x123',
        },
      } as UserOperationMetadata;

      const transactionMetadata = getTransactionMetadata(metadata);

      expect(transactionMetadata?.txParams?.from).toBe('0x123');
    });

    it('returns baseFeePerGas from user operation metadata', () => {
      const metadata = {
        ...USER_OPERATION_METADATA_MOCK,
        baseFeePerGas: '0x1',
      } as UserOperationMetadata;

      const transactionMetadata = getTransactionMetadata(metadata);

      expect(transactionMetadata?.baseFeePerGas).toBe('0x1');
    });

    it('returns chainId from user operation metadata', () => {
      const metadata = {
        ...USER_OPERATION_METADATA_MOCK,
        chainId: '0x5',
      } as UserOperationMetadata;

      const transactionMetadata = getTransactionMetadata(metadata);

      expect(transactionMetadata?.chainId).toBe('0x5');
    });

    it('returns hash as user operation transaction hash', () => {
      const metadata = {
        ...USER_OPERATION_METADATA_MOCK,
        transactionHash: '0x123',
      } as UserOperationMetadata;

      const transactionMetadata = getTransactionMetadata(metadata);

      expect(transactionMetadata?.hash).toBe('0x123');
    });

    it('returns gasUsed as user operation actualGasUsed', () => {
      const metadata = {
        ...USER_OPERATION_METADATA_MOCK,
        actualGasUsed: '0x123',
      } as UserOperationMetadata;

      const transactionMetadata = getTransactionMetadata(metadata);

      expect(transactionMetadata?.txReceipt?.gasUsed).toBe('0x123');
    });

    it('returns type as user operation transaction type', () => {
      const metadata = {
        ...USER_OPERATION_METADATA_MOCK,
        transactionType: TransactionType.simpleSend,
      } as UserOperationMetadata;

      const transactionMetadata = getTransactionMetadata(metadata);

      expect(transactionMetadata?.type).toBe(TransactionType.simpleSend);
    });

    it('returns isUserOperation as true', () => {
      expect(
        getTransactionMetadata(USER_OPERATION_METADATA_MOCK)?.isUserOperation,
      ).toBe(true);
    });

    it('includes swaps metadata', () => {
      const metadata = {
        ...USER_OPERATION_METADATA_MOCK,
        swapsMetadata: {
          approvalTxId: 'testTxId',
          approvalTxParams: { test: 'value' },
          destinationTokenAddress: '0x2',
          destinationTokenDecimals: '3',
          destinationTokenSymbol: 'TEST',
          estimatedBaseFee: '0x4',
          sourceTokenSymbol: 'TEST2',
          swapMetaData: { test: 'value' },
          swapTokenValue: '0x6',
        },
      } as unknown as UserOperationMetadata;

      const transactionMetadata = getTransactionMetadata(metadata);

      expect(transactionMetadata).toStrictEqual(
        expect.objectContaining({
          approvalTxId: 'testTxId',
          approvalTxParams: { test: 'value' },
          destinationTokenAddress: '0x2',
          destinationTokenDecimals: '3',
          destinationTokenSymbol: 'TEST',
          estimatedBaseFee: '0x4',
          sourceTokenSymbol: 'TEST2',
          swapMetaData: { test: 'value' },
          swapTokenValue: '0x6',
        }),
      );
    });
  });
});
