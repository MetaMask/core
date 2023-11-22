import type { Transaction as NonceTrackerTransaction } from 'nonce-tracker';

import type {
  GasPriceValue,
  FeeMarketEIP1559Values,
} from '../TransactionController';
import type { TransactionParams, TransactionMeta } from '../types';
import { TransactionStatus } from '../types';
import * as util from './utils';

const MAX_FEE_PER_GAS = 'maxFeePerGas';
const MAX_PRIORITY_FEE_PER_GAS = 'maxPriorityFeePerGas';
const GAS_PRICE = 'gasPrice';
const FAIL = 'lol';
const PASS = '0x1';

describe('utils', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('normalizeTxParams', () => {
    const commonInput = {
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

    it('normalizeTransaction', () => {
      const normalized = util.normalizeTxParams({
        ...commonInput,
      });
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

    it('normalizeTransaction if type is zero', () => {
      const normalized = util.normalizeTxParams({
        ...commonInput,
        type: '0x0',
      });
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
        type: '0x0',
      });
    });

    it('sets value if not specified', () => {
      expect(util.normalizeTxParams({ from: '0xfrom' })).toStrictEqual({
        from: '0xfrom',
        value: '0x0',
      });
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
    it('returns formatted transactions filtered by chain, from, isTransfer, and status', () => {
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
        {
          id: '4',
          chainId: '0x2',
          time: 123459,
          txParams: {
            from: fromAddress,
            gas: '0x103',
            value: '0x203',
            nonce: '0x4',
          },
          status: TransactionStatus.confirmed,
        },
        {
          id: '5',
          chainId: '0x2',
          isTransfer: true,
          time: 123460,
          txParams: {
            from: fromAddress,
            gas: '0x104',
            value: '0x204',
            nonce: '0x5',
          },
          status: TransactionStatus.confirmed,
        },
      ];

      const expectedResult: NonceTrackerTransaction[] = [
        {
          status: TransactionStatus.confirmed,
          history: [{}],
          txParams: {
            from: fromAddress,
            gas: '0x103',
            value: '0x203',
            nonce: '0x4',
          },
        },
      ];

      const result = util.getAndFormatTransactionsForNonceTracker(
        '0x2',
        fromAddress,
        TransactionStatus.confirmed,
        inputTransactions,
      );

      expect(result).toStrictEqual(expectedResult);
    });
  });

  describe('normalizeTxError', () => {
    const errorBase = {
      name: 'TxError',
      message: 'An error occurred',
      stack: 'Error stack trace',
    };
    it('returns the error object with no code and rpc properties', () => {
      const normalizedError = util.normalizeTxError(errorBase);

      expect(normalizedError).toStrictEqual({
        ...errorBase,
        code: undefined,
        rpc: undefined,
      });
    });

    it('returns the error object with code and rpc properties', () => {
      const error = {
        ...errorBase,
        code: 'ERROR_CODE',
        value: { code: 'rpc data' },
      };

      const normalizedError = util.normalizeTxError(error);

      expect(normalizedError).toStrictEqual({
        ...errorBase,
        code: 'ERROR_CODE',
        rpc: { code: 'rpc data' },
      });
    });
  });

  describe('normalizeGasFeeValues', () => {
    it('returns normalized object if legacy gas fees', () => {
      expect(
        util.normalizeGasFeeValues({ gasPrice: '1A', test: 'value' } as any),
      ).toStrictEqual({ gasPrice: '0x1A' });
    });

    it('returns normalized object if 1559 gas fees', () => {
      expect(
        util.normalizeGasFeeValues({
          maxFeePerGas: '1A',
          maxPriorityFeePerGas: '2B3C',
          test: 'value',
        } as any),
      ).toStrictEqual({ maxFeePerGas: '0x1A', maxPriorityFeePerGas: '0x2B3C' });
    });

    it('returns empty 1559 object if missing gas fees', () => {
      expect(
        util.normalizeGasFeeValues({
          test: 'value',
        } as any),
      ).toStrictEqual({
        maxFeePerGas: undefined,
        maxPriorityFeePerGas: undefined,
      });
    });
  });
});
