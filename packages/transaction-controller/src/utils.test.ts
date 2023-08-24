import { BigNumber } from '@ethersproject/bignumber';
import { ethErrors } from 'eth-rpc-errors';
import type { Transaction as NonceTrackerTransaction } from 'nonce-tracker/dist/NonceTracker';

import type {
  GasPriceValue,
  FeeMarketEIP1559Values,
} from './TransactionController';
import type { Transaction, TransactionMeta } from './types';
import { TransactionStatus } from './types';
import * as util from './utils';
import {
  getAndFormatTransactionsForNonceTracker,
  transactionMatchesNetwork,
  normalizeTxReceiptGasUsed,
  validateConfirmedExternalTransaction,
} from './utils';

const MAX_FEE_PER_GAS = 'maxFeePerGas';
const MAX_PRIORITY_FEE_PER_GAS = 'maxPriorityFeePerGas';
const GAS_PRICE = 'gasPrice';
const FAIL = 'lol';
const PASS = '0x1';

describe('utils', () => {
  it('normalizeTransaction', () => {
    const normalized = util.normalizeTransaction({
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

  describe('normalizeTxReceiptGasUsed', () => {
    it('should return a string representation of gasUsed when provided a BigNumber', () => {
      const gasUsedBigNumber = BigNumber.from('50000');
      const normalizedGasUsed = normalizeTxReceiptGasUsed(gasUsedBigNumber);
      expect(normalizedGasUsed).toBe('50000');
    });

    it('should return the input string as is', () => {
      const gasUsedString = '75000';
      const normalizedGasUsed = normalizeTxReceiptGasUsed(gasUsedString);
      expect(normalizedGasUsed).toBe('75000');
    });
  });

  describe('validateTransaction', () => {
    it('should throw if no from address', () => {
      expect(() => util.validateTransaction({} as any)).toThrow(
        'Invalid "from" address: undefined must be a valid string.',
      );
    });

    it('should throw if non-string from address', () => {
      expect(() => util.validateTransaction({ from: 1337 } as any)).toThrow(
        'Invalid "from" address: 1337 must be a valid string.',
      );
    });

    it('should throw if invalid from address', () => {
      expect(() => util.validateTransaction({ from: '1337' } as any)).toThrow(
        'Invalid "from" address: 1337 must be a valid string.',
      );
    });

    it('should throw if no data', () => {
      expect(() =>
        util.validateTransaction({
          from: '0x3244e191f1b4903970224322180f1fbbc415696b',
          to: '0x',
        } as any),
      ).toThrow('Invalid "to" address: 0x must be a valid string.');

      expect(() =>
        util.validateTransaction({
          from: '0x3244e191f1b4903970224322180f1fbbc415696b',
        } as any),
      ).toThrow('Invalid "to" address: undefined must be a valid string.');
    });

    it('should delete data', () => {
      const transaction = {
        data: 'foo',
        from: '0x3244e191f1b4903970224322180f1fbbc415696b',
        to: '0x',
      };
      util.validateTransaction(transaction);
      expect(transaction.to).toBeUndefined();
    });

    it('should throw if invalid to address', () => {
      expect(() =>
        util.validateTransaction({
          from: '0x3244e191f1b4903970224322180f1fbbc415696b',
          to: '1337',
        } as any),
      ).toThrow('Invalid "to" address: 1337 must be a valid string.');
    });

    it('should throw if value is invalid', () => {
      expect(() =>
        util.validateTransaction({
          from: '0x3244e191f1b4903970224322180f1fbbc415696b',
          to: '0x3244e191f1b4903970224322180f1fbbc415696b',
          value: '133-7',
        } as any),
      ).toThrow('Invalid "value": 133-7 is not a positive number.');

      expect(() =>
        util.validateTransaction({
          from: '0x3244e191f1b4903970224322180f1fbbc415696b',
          to: '0x3244e191f1b4903970224322180f1fbbc415696b',
          value: '133.7',
        } as any),
      ).toThrow('Invalid "value": 133.7 number must be denominated in wei.');

      expect(() =>
        util.validateTransaction({
          from: '0x3244e191f1b4903970224322180f1fbbc415696b',
          to: '0x3244e191f1b4903970224322180f1fbbc415696b',
          value: 'hello',
        } as any),
      ).toThrow('Invalid "value": hello number must be a valid number.');

      expect(() =>
        util.validateTransaction({
          from: '0x3244e191f1b4903970224322180f1fbbc415696b',
          to: '0x3244e191f1b4903970224322180f1fbbc415696b',
          value: 'one million dollar$',
        } as any),
      ).toThrow(
        'Invalid "value": one million dollar$ number must be a valid number.',
      );

      expect(() =>
        util.validateTransaction({
          from: '0x3244e191f1b4903970224322180f1fbbc415696b',
          to: '0x3244e191f1b4903970224322180f1fbbc415696b',
          value: '1',
        } as any),
      ).not.toThrow();
    });
  });

  describe('isEIP1559Transaction', () => {
    it('should detect EIP1559 transaction', () => {
      const tx: Transaction = { from: '' };
      const eip1559tx: Transaction = {
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
          time: 123456,
          transaction: {
            from: fromAddress,
            gas: '0x100',
            value: '0x200',
            nonce: '0x1',
          },
          status: TransactionStatus.confirmed,
        },
        {
          id: '2',
          time: 123457,
          transaction: {
            from: '0x124',
            gas: '0x101',
            value: '0x201',
            nonce: '0x2',
          },
          status: TransactionStatus.submitted,
        },
        {
          id: '3',
          time: 123458,
          transaction: {
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

      const result = getAndFormatTransactionsForNonceTracker(
        fromAddress,
        TransactionStatus.confirmed,
        inputTransactions,
      );
      expect(result).toStrictEqual(expectedResult);
    });
  });

  describe('transactionMatchesNetwork', () => {
    const transaction: TransactionMeta = {
      chainId: '0x1',
      networkID: '1',
      id: '1',
      time: 123456,
      transaction: {
        from: '0x123',
        gas: '0x100',
        value: '0x200',
        nonce: '0x1',
      },
      status: TransactionStatus.unapproved,
    };
    it('returns true if chainId matches', () => {
      const chainId = '0x1';
      const networkId = '1';
      expect(transactionMatchesNetwork(transaction, chainId, networkId)).toBe(
        true,
      );
    });

    it('returns false if chainId does not match', () => {
      const chainId = '0x1';
      const networkId = '1';
      expect(
        transactionMatchesNetwork(
          { ...transaction, chainId: '0x2' },
          chainId,
          networkId,
        ),
      ).toBe(false);
    });

    it('returns true if networkID matches', () => {
      const chainId = '0x1';
      const networkId = '1';
      expect(
        transactionMatchesNetwork(
          { ...transaction, chainId: undefined },
          chainId,
          networkId,
        ),
      ).toBe(true);
    });

    it('returns false if networkID does not match', () => {
      const chainId = '0x1';
      const networkId = '1';
      expect(
        transactionMatchesNetwork(
          { ...transaction, networkID: '2', chainId: undefined },
          chainId,
          networkId,
        ),
      ).toBe(false);
    });

    it('returns true if chainId and networkID are undefined', () => {
      const chainId = '0x2';
      const networkId = '1';
      expect(
        transactionMatchesNetwork(
          { ...transaction, chainId: undefined, networkID: undefined },
          chainId,
          networkId,
        ),
      ).toBe(false);
    });
  });

  describe('isSwapsDefaultTokenAddress', () => {
    it('should return true for matching address and chainId', () => {
      const chainId = '0x1'; // Mainnet chainId
      const expectedAddress = '0x0000000000000000000000000000000000000000';

      const result = util.isSwapsDefaultTokenAddress(expectedAddress, chainId);

      expect(result).toBe(true);
    });

    it('should return false for non-matching address and chainId', () => {
      const chainId = '0x1'; // Mainnet chainId
      const expectedAddress = '0x456def';

      const result = util.isSwapsDefaultTokenAddress(expectedAddress, chainId);

      expect(result).toBe(false);
    });

    it('should return false for missing address or chainId', () => {
      const chainId = '0x1';
      const address = '0x123abc';

      // Missing chainId
      expect(util.isSwapsDefaultTokenAddress(address)).toBe(false);

      // Missing address
      expect(util.isSwapsDefaultTokenAddress(undefined, chainId)).toBe(false);

      // Missing both
      expect(util.isSwapsDefaultTokenAddress()).toBe(false);
    });
  });

  describe('validateConfirmedExternalTransaction', () => {
    const mockTransactionMeta = (status: TransactionStatus, nonce: string) => {
      const meta = {
        status,
        transaction: { nonce },
      } as TransactionMeta;
      return meta;
    };

    it('should throw if transactionMeta or transaction is missing', () => {
      expect(() =>
        validateConfirmedExternalTransaction(undefined, [], []),
      ).toThrow(
        ethErrors.rpc.invalidParams(
          '"transactionMeta" or "transactionMeta.transaction" is missing',
        ),
      );

      expect(() =>
        validateConfirmedExternalTransaction({} as TransactionMeta, [], []),
      ).toThrow(
        ethErrors.rpc.invalidParams(
          '"transactionMeta" or "transactionMeta.transaction" is missing',
        ),
      );
    });

    it('should throw if transaction status is not confirmed', () => {
      const transactionMeta = mockTransactionMeta(
        TransactionStatus.submitted,
        '123',
      );
      expect(() =>
        validateConfirmedExternalTransaction(transactionMeta),
      ).toThrow(
        ethErrors.rpc.invalidParams(
          'External transaction status should be "confirmed"',
        ),
      );
    });

    it('should throw if external transaction nonce is in pending txs', () => {
      const externalTxNonce = '123';
      const transactionMeta = mockTransactionMeta(
        TransactionStatus.confirmed,
        externalTxNonce,
      );
      const pendingTxs = [
        mockTransactionMeta(TransactionStatus.submitted, externalTxNonce),
      ];

      expect(() =>
        validateConfirmedExternalTransaction(transactionMeta, [], pendingTxs),
      ).toThrow(
        ethErrors.rpc.invalidParams(
          'External transaction nonce should not be in pending txs',
        ),
      );
    });

    it('should throw if external transaction nonce is in confirmed txs', () => {
      const externalTxNonce = '123';
      const transactionMeta = mockTransactionMeta(
        TransactionStatus.confirmed,
        externalTxNonce,
      );
      const confirmedTxs = [
        mockTransactionMeta(TransactionStatus.confirmed, externalTxNonce),
      ];

      expect(() =>
        validateConfirmedExternalTransaction(transactionMeta, confirmedTxs, []),
      ).toThrow(
        ethErrors.rpc.invalidParams(
          'External transaction nonce should not be in confirmed txs',
        ),
      );
    });

    it('should not throw if all validations pass', () => {
      const externalTxNonce = '123';
      const transactionMeta = mockTransactionMeta(
        TransactionStatus.confirmed,
        externalTxNonce,
      );

      expect(() =>
        validateConfirmedExternalTransaction(transactionMeta, [], []),
      ).not.toThrow();
    });
  });
});
