import { rpcErrors } from '@metamask/rpc-errors';
import type { Transaction as NonceTrackerTransaction } from 'nonce-tracker/dist/NonceTracker';

import type {
  GasPriceValue,
  FeeMarketEIP1559Values,
} from './TransactionController';
import type { TransactionParams, TransactionMeta } from './types';
import { TransactionStatus } from './types';
import * as util from './utils';

const MAX_FEE_PER_GAS = 'maxFeePerGas';
const MAX_PRIORITY_FEE_PER_GAS = 'maxPriorityFeePerGas';
const GAS_PRICE = 'gasPrice';
const FAIL = 'lol';
const PASS = '0x1';

const TRANSACTION_PARAMS_MOCK: TransactionParams = {
  data: 'data',
  from: 'FROM',
  gas: 'gas',
  gasPrice: 'gasPrice',
  nonce: 'nonce',
  to: 'TO',
  value: 'value',
  maxFeePerGas: 'maxFeePerGas',
  maxPriorityFeePerGas: 'maxPriorityFeePerGas',
  estimatedBaseFee: 'estimatedBaseFee',
};

describe('utils', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('normalizeTransactionParams', () => {
    it('normalizes properties', () => {
      const normalized = util.normalizeTransactionParams(
        TRANSACTION_PARAMS_MOCK,
      );

      expect(normalized).toStrictEqual({
        data: '0xdata',
        from: '0xfrom',
        gas: '0xgas',
        gasPrice: '0xgasPrice',
        nonce: '0xnonce',
        to: '0xto',
        value: '0xvalue',
        maxFeePerGas: '0xmaxFeePerGas',
        maxPriorityFeePerGas: '0xmaxPriorityFeePerGas',
        estimatedBaseFee: '0xestimatedBaseFee',
      });
    });

    it('retains legacy type if specified', () => {
      expect(
        util.normalizeTransactionParams({
          ...TRANSACTION_PARAMS_MOCK,
          type: '0x0',
        }),
      ).toStrictEqual(
        expect.objectContaining({
          type: '0x0',
        }),
      );
    });

    it('ensures data is even length prefixed hex string', () => {
      expect(
        util.normalizeTransactionParams({
          ...TRANSACTION_PARAMS_MOCK,
          data: '123',
        }),
      ).toStrictEqual(expect.objectContaining({ data: '0x0123' }));
    });
  });

  describe('validateTxParams', () => {
    it('should throw if no from address', () => {
      expect(() => util.validateTxParams({} as any)).toThrow(
        rpcErrors.invalidParams(
          'Invalid "from" address: undefined must be a valid string.',
        ),
      );
    });

    it('should throw if non-string from address', () => {
      expect(() => util.validateTxParams({ from: 1337 } as any)).toThrow(
        rpcErrors.invalidParams(
          'Invalid "from" address: 1337 must be a valid string.',
        ),
      );
    });

    it('should throw if invalid from address', () => {
      expect(() => util.validateTxParams({ from: '1337' } as any)).toThrow(
        rpcErrors.invalidParams(
          'Invalid "from" address: 1337 must be a valid string.',
        ),
      );
    });

    it('should throw if no data', () => {
      expect(() =>
        util.validateTxParams({
          from: '0x3244e191f1b4903970224322180f1fbbc415696b',
          to: '0x',
        } as any),
      ).toThrow(
        rpcErrors.invalidParams(
          'Invalid "to" address: 0x must be a valid string.',
        ),
      );

      expect(() =>
        util.validateTxParams({
          from: '0x3244e191f1b4903970224322180f1fbbc415696b',
        } as any),
      ).toThrow(
        rpcErrors.invalidParams(
          'Invalid "to" address: undefined must be a valid string.',
        ),
      );
    });

    it('should delete data', () => {
      const transaction = {
        data: 'foo',
        from: '0x3244e191f1b4903970224322180f1fbbc415696b',
        to: '0x',
      };
      util.validateTxParams(transaction);
      expect(transaction.to).toBeUndefined();
    });

    it('should throw if invalid to address', () => {
      expect(() =>
        util.validateTxParams({
          from: '0x3244e191f1b4903970224322180f1fbbc415696b',
          to: '1337',
        } as any),
      ).toThrow(
        rpcErrors.invalidParams(
          'Invalid "to" address: 1337 must be a valid string.',
        ),
      );
    });

    it('should throw if value is invalid', () => {
      expect(() =>
        util.validateTxParams({
          from: '0x3244e191f1b4903970224322180f1fbbc415696b',
          to: '0x3244e191f1b4903970224322180f1fbbc415696b',
          value: '133-7',
        } as any),
      ).toThrow(
        rpcErrors.invalidParams(
          'Invalid "value": 133-7 is not a positive number.',
        ),
      );

      expect(() =>
        util.validateTxParams({
          from: '0x3244e191f1b4903970224322180f1fbbc415696b',
          to: '0x3244e191f1b4903970224322180f1fbbc415696b',
          value: '133.7',
        } as any),
      ).toThrow(
        rpcErrors.invalidParams(
          'Invalid "value": 133.7 number must be denominated in wei.',
        ),
      );

      expect(() =>
        util.validateTxParams({
          from: '0x3244e191f1b4903970224322180f1fbbc415696b',
          to: '0x3244e191f1b4903970224322180f1fbbc415696b',
          value: 'hello',
        } as any),
      ).toThrow(
        rpcErrors.invalidParams(
          'Invalid "value": hello number must be a valid number.',
        ),
      );

      expect(() =>
        util.validateTxParams({
          from: '0x3244e191f1b4903970224322180f1fbbc415696b',
          to: '0x3244e191f1b4903970224322180f1fbbc415696b',
          value: 'one million dollar$',
        } as any),
      ).toThrow(
        rpcErrors.invalidParams(
          'Invalid "value": one million dollar$ number must be a valid number.',
        ),
      );

      expect(() =>
        util.validateTxParams({
          from: '0x3244e191f1b4903970224322180f1fbbc415696b',
          to: '0x3244e191f1b4903970224322180f1fbbc415696b',
          value: '1',
        } as any),
      ).not.toThrow();
    });

    it('throws if params specifies an EIP-1559 transaction but the current network does not support EIP-1559', () => {
      expect(() =>
        util.validateTxParams(
          {
            from: '0x3244e191f1b4903970224322180f1fbbc415696b',
            maxFeePerGas: '2',
            maxPriorityFeePerGas: '3',
          } as any,
          false,
        ),
      ).toThrow(
        rpcErrors.invalidParams(
          'Invalid transaction params: params specify an EIP-1559 transaction but the current network does not support EIP-1559',
        ),
      );
    });
  });

  describe('isEIP1559Transaction', () => {
    it('should detect EIP1559 transaction', () => {
      const tx: TransactionParams = { from: '' };
      const eip1559tx: TransactionParams = {
        ...tx,
        maxFeePerGas: '2',
        maxPriorityFeePerGas: '3',
      };
      expect(util.isEIP1559Transaction(eip1559tx)).toBe(true);
      expect(util.isEIP1559Transaction(tx)).toBe(false);
    });
  });

  describe('validateGasValues', () => {
    it('should throw when provided invalid gas values', () => {
      const gasValues: GasPriceValue = {
        [GAS_PRICE]: FAIL,
      };
      expect(() => util.validateGasValues(gasValues)).toThrow(TypeError);
      expect(() => util.validateGasValues(gasValues)).toThrow(
        `expected hex string for ${GAS_PRICE} but received: ${FAIL}`,
      );
    });

    it('should throw when any provided gas values are invalid', () => {
      const gasValues: FeeMarketEIP1559Values = {
        [MAX_PRIORITY_FEE_PER_GAS]: PASS,
        [MAX_FEE_PER_GAS]: FAIL,
      };
      expect(() => util.validateGasValues(gasValues)).toThrow(TypeError);
      expect(() => util.validateGasValues(gasValues)).toThrow(
        `expected hex string for ${MAX_FEE_PER_GAS} but received: ${FAIL}`,
      );
    });

    it('should return true when provided valid gas values', () => {
      const gasValues: FeeMarketEIP1559Values = {
        [MAX_FEE_PER_GAS]: PASS,
        [MAX_PRIORITY_FEE_PER_GAS]: PASS,
      };
      expect(() => util.validateGasValues(gasValues)).not.toThrow(TypeError);
    });
  });

  describe('isFeeMarketEIP1559Values', () => {
    it('should detect if isFeeMarketEIP1559Values', () => {
      const gasValues = {
        [MAX_PRIORITY_FEE_PER_GAS]: PASS,
        [MAX_FEE_PER_GAS]: FAIL,
      };
      expect(util.isFeeMarketEIP1559Values(gasValues)).toBe(true);
      expect(util.isGasPriceValue(gasValues)).toBe(false);
    });
  });

  describe('isGasPriceValue', () => {
    it('should detect if isGasPriceValue', () => {
      const gasValues: GasPriceValue = {
        [GAS_PRICE]: PASS,
      };
      expect(util.isGasPriceValue(gasValues)).toBe(true);
      expect(util.isFeeMarketEIP1559Values(gasValues)).toBe(false);
    });
  });

  describe('getIncreasedPriceHex', () => {
    it('should get increased price from number as hex', () => {
      expect(util.getIncreasedPriceHex(1358778842, 1.1)).toBe('0x5916a6d6');
    });
  });

  describe('getIncreasedPriceFromExisting', () => {
    it('should get increased price from hex as hex', () => {
      expect(util.getIncreasedPriceFromExisting('0x50fd51da', 1.1)).toBe(
        '0x5916a6d6',
      );
    });
  });

  describe('validateMinimumIncrease', () => {
    it('should throw if increase does not meet minimum requirement', () => {
      expect(() =>
        util.validateMinimumIncrease('0x50fd51da', '0x5916a6d6'),
      ).toThrow(Error);

      expect(() =>
        util.validateMinimumIncrease('0x50fd51da', '0x5916a6d6'),
      ).toThrow(
        'The proposed value: 1358778842 should meet or exceed the minimum value: 1494656726',
      );
    });

    it('should not throw if increase meets minimum requirement', () => {
      expect(() =>
        util.validateMinimumIncrease('0x5916a6d6', '0x5916a6d6'),
      ).not.toThrow(Error);
    });

    it('should not throw if increase exceeds minimum requirement', () => {
      expect(() =>
        util.validateMinimumIncrease('0x7162a5ca', '0x5916a6d6'),
      ).not.toThrow(Error);
    });
  });

  describe('getAndFormatTransactionsForNonceTracker', () => {
    it('should return an array of formatted NonceTrackerTransaction objects filtered by fromAddress and transactionStatus', () => {
      const fromAddress = '0x123';
      const inputTransactions: TransactionMeta[] = [
        {
          id: '1',
          chainId: '0x1',
          time: 123456,
          txParams: {
            from: fromAddress,
            gas: '0x100',
            value: '0x200',
            nonce: '0x1',
          },
          status: TransactionStatus.confirmed,
        },
        {
          id: '2',
          chainId: '0x1',
          time: 123457,
          txParams: {
            from: '0x124',
            gas: '0x101',
            value: '0x201',
            nonce: '0x2',
          },
          status: TransactionStatus.submitted,
        },
        {
          id: '3',
          chainId: '0x1',
          time: 123458,
          txParams: {
            from: fromAddress,
            gas: '0x102',
            value: '0x202',
            nonce: '0x3',
          },
          status: TransactionStatus.approved,
        },
      ];

      const expectedResult: NonceTrackerTransaction[] = [
        {
          status: TransactionStatus.confirmed,
          history: [{}],
          txParams: {
            from: fromAddress,
            gas: '0x100',
            value: '0x200',
            nonce: '0x1',
          },
        },
      ];

      const result = util.getAndFormatTransactionsForNonceTracker(
        '0x1',
        fromAddress,
        TransactionStatus.confirmed,
        inputTransactions,
      );
      expect(result).toStrictEqual(expectedResult);
    });
  });

  describe('padHexToEvenLength', () => {
    it('returns same value if already even length and has prefix', () => {
      expect(util.padHexToEvenLength('0x1234')).toBe('0x1234');
    });

    it('returns same value if already even length and no prefix', () => {
      expect(util.padHexToEvenLength('1234')).toBe('1234');
    });

    it('returns padded value if not even length and has prefix', () => {
      expect(util.padHexToEvenLength('0x123')).toBe('0x0123');
    });

    it('returns padded value if not even length and no prefix', () => {
      expect(util.padHexToEvenLength('123')).toBe('0123');
    });
  });
});