import {
  Transaction,
  GasPriceValue,
  FeeMarketEIP1559Values,
} from './TransactionController';
import * as util from './utils';

const MAX_FEE_PER_GAS = 'maxFeePerGas';
const MAX_PRIORITY_FEE_PER_GAS = 'maxPriorityFeePerGas';
const GAS_PRICE = 'gasPrice';
const FAIL = 'lol';
const PASS = '0x1';

describe('utils', () => {
  describe('getEtherscanApiUrl', () => {
    const networkType = 'mainnet';
    const address = '0xC7D3BFDeA106B446Cf9f2Db354D496e6Dd8b2525';
    const action = 'txlist';

    it('should return a correctly structured url', () => {
      const url = util.getEtherscanApiUrl(networkType, { address, action });
      expect(url.indexOf(`&action=${action}`)).toBeGreaterThan(0);
    });

    it('should return a correctly structured url with from block', () => {
      const fromBlock = 'xxxxxx';
      const url = util.getEtherscanApiUrl(networkType, {
        address,
        action,
        startBlock: fromBlock,
      });
      expect(url.indexOf(`&startBlock=${fromBlock}`)).toBeGreaterThan(0);
    });

    it('should return a correctly structured url with testnet subdomain', () => {
      const ropsten = 'ropsten';
      const url = util.getEtherscanApiUrl(ropsten, { address, action });
      expect(url.indexOf(`https://api-${ropsten}`)).toBe(0);
    });

    it('should return a correctly structured url with apiKey', () => {
      const apiKey = 'xxxxxx';
      const url = util.getEtherscanApiUrl(networkType, {
        address,
        action,
        startBlock: 'xxxxxx',
        apikey: apiKey,
      });
      expect(url.indexOf(`&apikey=${apiKey}`)).toBeGreaterThan(0);
    });
  });

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
      expect(util.getIncreasedPriceHex(1358778842, 1.1)).toStrictEqual(
        '0x5916a6d6',
      );
    });
  });

  describe('getIncreasedPriceFromExisting', () => {
    it('should get increased price from hex as hex', () => {
      expect(
        util.getIncreasedPriceFromExisting('0x50fd51da', 1.1),
      ).toStrictEqual('0x5916a6d6');
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
});
