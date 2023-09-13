import type { Transaction as NonceTrackerTransaction } from 'nonce-tracker/dist/NonceTracker';

import type {
  GasPriceValue,
  FeeMarketEIP1559Values,
} from './TransactionController';
import type { Transaction, TransactionMeta } from './types';
import { TransactionStatus, TransactionType } from './types';
import * as util from './utils';
import {
  getAndFormatTransactionsForNonceTracker,
  transactionMatchesNetwork,
  determineTransactionType,
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

  describe('determineTransactionType', () => {
    const FROM_MOCK = '0x9e';
    const txParams = {
      to: '0x9e673399f795D01116e9A8B2dD2F156705131ee9',
      data: '0xa9059cbb0000000000000000000000002f318C334780961FB129D2a6c30D0763d9a5C970000000000000000000000000000000000000000000000000000000000000000a',
      from: FROM_MOCK,
    };

    it('returns a token transfer type when the recipient is a contract, there is no value passed, and data is for the respective method call', async () => {
      class EthQuery {
        getCode(_to: any, cb: any) {
          cb(null, '0xab');
        }
      }
      const result = await determineTransactionType(
        {
          to: '0x9e673399f795D01116e9A8B2dD2F156705131ee9',
          data: '0xa9059cbb0000000000000000000000002f318C334780961FB129D2a6c30D0763d9a5C970000000000000000000000000000000000000000000000000000000000000000a',
          from: FROM_MOCK,
        },
        // @ts-expect-error Mock eth query does not fulfill type requirements
        new EthQuery(),
      );

      expect(result).toMatchObject({
        type: TransactionType.tokenMethodTransfer,
        getCodeResponse: '0xab',
      });
    });

    it(
      'does NOT return a token transfer type and instead returns contract interaction' +
        ' when the recipient is a contract, the data matches the respective method call, but there is a value passed',
      async () => {
        class EthQuery {
          getCode(_to: any, cb: any) {
            cb(null, '0xab');
          }
        }
        const resultWithEmptyValue = await determineTransactionType(
          txParams,
          // @ts-expect-error Mock eth query does not fulfill type requirements
          new EthQuery(),
        );
        expect(resultWithEmptyValue).toMatchObject({
          type: TransactionType.tokenMethodTransfer,
          getCodeResponse: '0xab',
        });

        const resultWithEmptyValue2 = await determineTransactionType(
          {
            value: '0x0000',
            ...txParams,
          },
          // @ts-expect-error Mock eth query does not fulfill type requirements
          new EthQuery(),
        );

        expect(resultWithEmptyValue2).toMatchObject({
          type: TransactionType.tokenMethodTransfer,
          getCodeResponse: '0xab',
        });

        const resultWithValue = await determineTransactionType(
          {
            value: '0x12345',
            ...txParams,
          },
          // @ts-expect-error Mock eth query does not fulfill type requirements
          new EthQuery(),
        );
        expect(resultWithValue).toMatchObject({
          type: TransactionType.contractInteraction,
          getCodeResponse: '0xab',
        });
      },
    );

    it('does NOT return a token transfer type when the recipient is not a contract but the data matches the respective method call', async () => {
      class EthQuery {
        getCode(_to: any, cb: any) {
          cb(null, '0x');
        }
      }
      const result = await determineTransactionType(
        txParams,
        // @ts-expect-error Mock eth query does not fulfill type requirements
        new EthQuery(),
      );
      expect(result).toMatchObject({
        type: TransactionType.simpleSend,
        getCodeResponse: '0x',
      });
    });

    it('returns a token approve type when the recipient is a contract and data is for the respective method call', async () => {
      class EthQuery {
        getCode(_to: any, cb: any) {
          cb(null, '0xab');
        }
      }
      const result = await determineTransactionType(
        {
          ...txParams,
          data: '0x095ea7b30000000000000000000000002f318C334780961FB129D2a6c30D0763d9a5C9700000000000000000000000000000000000000000000000000000000000000005',
        },
        // @ts-expect-error Mock eth query does not fulfill type requirements
        new EthQuery(),
      );
      expect(result).toMatchObject({
        type: TransactionType.tokenMethodApprove,
        getCodeResponse: '0xab',
      });
    });

    it('returns a contract deployment type when "to" is falsy and there is data', async () => {
      class EthQuery {
        getCode(_to: any, cb: any) {
          cb(null, '');
        }
      }
      const result = await determineTransactionType(
        {
          ...txParams,
          to: '',
          data: '0xabd',
        },
        // @ts-expect-error Mock eth query does not fulfill type requirements
        new EthQuery(),
      );
      expect(result).toMatchObject({
        type: TransactionType.deployContract,
        getCodeResponse: undefined,
      });
    });

    it('returns a simple send type with a 0x getCodeResponse when there is data, but the "to" address is not a contract address', async () => {
      class EthQuery {
        getCode(_to: any, cb: any) {
          cb(null, '0x');
        }
      }
      const result = await determineTransactionType(
        {
          ...txParams,
          data: '0xabd',
        },
        // @ts-expect-error Mock eth query does not fulfill type requirements
        new EthQuery(),
      );
      expect(result).toMatchObject({
        type: TransactionType.simpleSend,
        getCodeResponse: '0x',
      });
    });

    it('returns a simple send type with a null getCodeResponse when "to" is truthy and there is data, but getCode returns an error', async () => {
      class EthQuery {
        getCode(_to: any, cb: any) {
          cb(new Error('Some error'));
        }
      }
      const result = await determineTransactionType(
        {
          ...txParams,
          data: '0xabd',
        },
        // @ts-expect-error Mock eth query does not fulfill type requirements
        new EthQuery(),
      );
      expect(result).toMatchObject({
        type: TransactionType.simpleSend,
        getCodeResponse: null,
      });
    });

    it('returns a contract interaction type with the correct getCodeResponse when "to" is truthy and there is data, and it is not a token transaction', async () => {
      class EthQuery {
        getCode(_to: any, cb: any) {
          cb(null, '0xa');
        }
      }
      const result = await determineTransactionType(
        {
          ...txParams,
          data: 'abd',
        },
        // @ts-expect-error Mock eth query does not fulfill type requirements
        new EthQuery(),
      );
      expect(result).toMatchObject({
        type: TransactionType.contractInteraction,
        getCodeResponse: '0xa',
      });
    });

    it('returns a contract interaction type with the correct getCodeResponse when "to" is a contract address and data is falsy', async () => {
      class EthQuery {
        getCode(_to: any, cb: any) {
          cb(null, '0xa');
        }
      }
      const result = await determineTransactionType(
        {
          ...txParams,
          data: '',
        },
        // @ts-expect-error Mock eth query does not fulfill type requirements
        new EthQuery(),
      );
      expect(result).toMatchObject({
        type: TransactionType.contractInteraction,
        getCodeResponse: '0xa',
      });
    });

    it('returns contractInteraction for send with approve', async () => {
      class EthQuery {
        getCode(_to: any, cb: any) {
          cb(null, '0xa');
        }
      }

      const result = await determineTransactionType(
        {
          ...txParams,
          value: '0x5af3107a4000',
          data: '0x095ea7b30000000000000000000000002f318C334780961FB129D2a6c30D0763d9a5C9700000000000000000000000000000000000000000000000000000000000000005',
        },
        // @ts-expect-error Mock eth query does not fulfill type requirements
        new EthQuery(),
      );
      expect(result).toMatchObject({
        type: TransactionType.contractInteraction,
        getCodeResponse: '0xa',
      });
    });
  });
});
