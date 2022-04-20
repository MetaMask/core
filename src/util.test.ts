import 'isomorphic-fetch';
import { BN } from 'ethereumjs-util';
import nock from 'nock';
import * as util from './util';
import {
  Transaction,
  GasPriceValue,
  FeeMarketEIP1559Values,
} from './transaction/TransactionController';

const VALID = '4e1fF7229BDdAf0A73DF183a88d9c3a04cc975e0';
const SOME_API = 'https://someapi.com';
const SOME_FAILING_API = 'https://somefailingapi.com';

const DEFAULT_IPFS_URL_FORMAT = 'ipfs://';
const ALTERNATIVE_IPFS_URL_FORMAT = 'ipfs://ipfs/';
const IPFS_CID_V0 = 'QmdfTbBqBPQ7VNxZEYEj14VmRuZBkqFbiwReogJgS1zR1n';
const IPFS_CID_V1 =
  'bafybeihdwdcefgh4dqkjv67uzcmw7ojee6xedzdetojuzjevtenxquvyku';

const IFPS_GATEWAY = 'dweb.link';

const MAX_FEE_PER_GAS = 'maxFeePerGas';
const MAX_PRIORITY_FEE_PER_GAS = 'maxPriorityFeePerGas';
const GAS_PRICE = 'gasPrice';
const FAIL = 'lol';
const PASS = '0x1';

describe('util', () => {
  beforeEach(() => {
    nock.cleanAll();
  });

  it('bNToHex', () => {
    expect(util.BNToHex(new BN('1337'))).toBe('0x539');
  });

  it('fractionBN', () => {
    expect(util.fractionBN(new BN('1337'), 9, 10).toNumber()).toBe(1203);
  });

  it('getBuyURL', () => {
    expect(util.getBuyURL(undefined, 'foo', 1337)).toBe(
      'https://buy.coinbase.com/?code=9ec56d01-7e81-5017-930c-513daa27bb6a&amount=1337&address=foo&crypto_currency=ETH',
    );

    expect(util.getBuyURL('1', 'foo', 1337)).toBe(
      'https://buy.coinbase.com/?code=9ec56d01-7e81-5017-930c-513daa27bb6a&amount=1337&address=foo&crypto_currency=ETH',
    );
    expect(util.getBuyURL('3')).toBe('https://faucet.metamask.io/');
    expect(util.getBuyURL('4')).toBe('https://www.rinkeby.io/');
    expect(util.getBuyURL('5')).toBe('https://goerli-faucet.slock.it/');
    expect(util.getBuyURL('42')).toBe(
      'https://github.com/kovan-testnet/faucet',
    );
    expect(util.getBuyURL('unrecognized network ID')).toBeUndefined();
  });

  it('hexToBN', () => {
    expect(util.hexToBN('0x1337').toNumber()).toBe(4919);
  });

  describe('fromHex', () => {
    it('converts a string that represents a number in hexadecimal format with leading "0x" into a BN', () => {
      expect(util.fromHex('0x1337')).toStrictEqual(new BN(4919));
    });

    it('converts a string that represents a number in hexadecimal format without leading "0x" into a BN', () => {
      expect(util.fromHex('1337')).toStrictEqual(new BN(4919));
    });

    it('does nothing to a BN', () => {
      const bn = new BN(4919);
      expect(util.fromHex(bn)).toBe(bn);
    });
  });

  describe('toHex', () => {
    it('converts a BN to a hex string prepended with "0x"', () => {
      expect(util.toHex(new BN(4919))).toStrictEqual('0x1337');
    });

    it('parses a string as a number in decimal format and converts it to a hex string prepended with "0x"', () => {
      expect(util.toHex('4919')).toStrictEqual('0x1337');
    });

    it('throws an error if given a string with decimals', () => {
      expect(() => util.toHex('4919.3')).toThrow('Invalid character');
    });

    it('converts a number to a hex string prepended with "0x"', () => {
      expect(util.toHex(4919)).toStrictEqual('0x1337');
    });

    it('throws an error if given a float', () => {
      expect(() => util.toHex(4919.3)).toThrow('Invalid character');
    });

    it('does nothing to a string that is already a "0x"-prepended hex value', () => {
      expect(util.toHex('0x1337')).toStrictEqual('0x1337');
    });

    it('throws an error if given a non-"0x"-prepended string that is not a valid hex value', () => {
      expect(() => util.toHex('zzzz')).toThrow('Invalid character');
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

  describe('gweiDecToWEIBN', () => {
    it('should convert a whole number to WEI', () => {
      expect(util.gweiDecToWEIBN(1).toNumber()).toBe(1000000000);
      expect(util.gweiDecToWEIBN(123).toNumber()).toBe(123000000000);
      expect(util.gweiDecToWEIBN(101).toNumber()).toBe(101000000000);
      expect(util.gweiDecToWEIBN(1234).toNumber()).toBe(1234000000000);
      expect(util.gweiDecToWEIBN(1000).toNumber()).toBe(1000000000000);
    });

    it('should convert a number with a decimal part to WEI', () => {
      expect(util.gweiDecToWEIBN(1.1).toNumber()).toBe(1100000000);
      expect(util.gweiDecToWEIBN(123.01).toNumber()).toBe(123010000000);
      expect(util.gweiDecToWEIBN(101.001).toNumber()).toBe(101001000000);
      expect(util.gweiDecToWEIBN(100.001).toNumber()).toBe(100001000000);
      expect(util.gweiDecToWEIBN(1234.567).toNumber()).toBe(1234567000000);
    });

    it('should convert a number < 1 to WEI', () => {
      expect(util.gweiDecToWEIBN(0.1).toNumber()).toBe(100000000);
      expect(util.gweiDecToWEIBN(0.01).toNumber()).toBe(10000000);
      expect(util.gweiDecToWEIBN(0.001).toNumber()).toBe(1000000);
      expect(util.gweiDecToWEIBN(0.567).toNumber()).toBe(567000000);
    });

    it('should round to whole WEI numbers', () => {
      expect(util.gweiDecToWEIBN(0.1001).toNumber()).toBe(100100000);
      expect(util.gweiDecToWEIBN(0.0109).toNumber()).toBe(10900000);
      expect(util.gweiDecToWEIBN(0.0014).toNumber()).toBe(1400000);
      expect(util.gweiDecToWEIBN(0.5676).toNumber()).toBe(567600000);
    });

    it('should handle inputs with more than 9 decimal places', () => {
      expect(util.gweiDecToWEIBN(1.0000000162).toNumber()).toBe(1000000016);
      expect(util.gweiDecToWEIBN(1.0000000165).toNumber()).toBe(1000000017);
      expect(util.gweiDecToWEIBN(1.0000000199).toNumber()).toBe(1000000020);
      expect(util.gweiDecToWEIBN(1.9999999999).toNumber()).toBe(2000000000);
      expect(util.gweiDecToWEIBN(1.0000005998).toNumber()).toBe(1000000600);
      expect(util.gweiDecToWEIBN(123456.0000005998).toNumber()).toBe(
        123456000000600,
      );
      expect(util.gweiDecToWEIBN(1.000000016025).toNumber()).toBe(1000000016);
      expect(util.gweiDecToWEIBN(1.0000000160000028).toNumber()).toBe(
        1000000016,
      );
      expect(util.gweiDecToWEIBN(1.000000016522).toNumber()).toBe(1000000017);
      expect(util.gweiDecToWEIBN(1.000000016800022).toNumber()).toBe(
        1000000017,
      );
    });

    it('should work if there are extraneous trailing decimal zeroes', () => {
      expect(util.gweiDecToWEIBN('0.5000').toNumber()).toBe(500000000);
      expect(util.gweiDecToWEIBN('123.002300').toNumber()).toBe(123002300000);
      expect(util.gweiDecToWEIBN('123.002300000000').toNumber()).toBe(
        123002300000,
      );
      expect(util.gweiDecToWEIBN('0.00000200000').toNumber()).toBe(2000);
    });

    it('should work if there is no whole number specified', () => {
      expect(util.gweiDecToWEIBN('.1').toNumber()).toBe(100000000);
      expect(util.gweiDecToWEIBN('.01').toNumber()).toBe(10000000);
      expect(util.gweiDecToWEIBN('.001').toNumber()).toBe(1000000);
      expect(util.gweiDecToWEIBN('.567').toNumber()).toBe(567000000);
    });

    it('should handle NaN', () => {
      expect(util.gweiDecToWEIBN(NaN).toNumber()).toBe(0);
    });
  });

  describe('weiHexToGweiDec', () => {
    it('should convert a whole number to WEI', () => {
      const testData = [
        {
          input: '3b9aca00',
          expectedResult: '1',
        },
        {
          input: '1ca35f0e00',
          expectedResult: '123',
        },
        {
          input: '178411b200',
          expectedResult: '101',
        },
        {
          input: '11f5021b400',
          expectedResult: '1234',
        },
      ];
      testData.forEach(({ input, expectedResult }) => {
        expect(util.weiHexToGweiDec(input)).toBe(expectedResult);
      });
    });

    it('should convert a number with a decimal part to WEI', () => {
      const testData = [
        {
          input: '4190ab00',
          expectedResult: '1.1',
        },
        {
          input: '1ca3f7a480',
          expectedResult: '123.01',
        },
        {
          input: '178420f440',
          expectedResult: '101.001',
        },
        {
          input: '11f71ed6fc0',
          expectedResult: '1234.567',
        },
      ];

      testData.forEach(({ input, expectedResult }) => {
        expect(util.weiHexToGweiDec(input)).toBe(expectedResult);
      });
    });

    it('should convert a number < 1 to WEI', () => {
      const testData = [
        {
          input: '5f5e100',
          expectedResult: '0.1',
        },
        {
          input: '989680',
          expectedResult: '0.01',
        },
        {
          input: 'f4240',
          expectedResult: '0.001',
        },
        {
          input: '21cbbbc0',
          expectedResult: '0.567',
        },
      ];

      testData.forEach(({ input, expectedResult }) => {
        expect(util.weiHexToGweiDec(input)).toBe(expectedResult);
      });
    });

    it('should work with 0x prefixed values', () => {
      expect(util.weiHexToGweiDec('0x5f48b0f7')).toBe('1.598599415');
    });
  });

  describe('safelyExecute', () => {
    it('should swallow errors', async () => {
      expect(
        await util.safelyExecute(() => {
          throw new Error('ahh');
        }),
      ).toBeUndefined();
    });
  });

  describe('safelyExecuteWithTimeout', () => {
    it('should swallow errors', async () => {
      expect(
        await util.safelyExecuteWithTimeout(() => {
          throw new Error('ahh');
        }),
      ).toBeUndefined();
    });

    it('should resolve', async () => {
      const response = await util.safelyExecuteWithTimeout(() => {
        return new Promise((res) => setTimeout(() => res('response'), 200));
      });
      expect(response).toStrictEqual('response');
    });

    it('should timeout', async () => {
      expect(
        await util.safelyExecuteWithTimeout(() => {
          return new Promise((res) => setTimeout(res, 800));
        }),
      ).toBeUndefined();
    });
  });

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

  describe('toChecksumHexAddress', () => {
    const fullAddress = `0x${VALID}`;
    it('should return address for valid address', () => {
      expect(util.toChecksumHexAddress(fullAddress)).toBe(fullAddress);
    });

    it('should return address for non prefix address', () => {
      expect(util.toChecksumHexAddress(VALID)).toBe(fullAddress);
    });
  });

  describe('isValidHexAddress', () => {
    it('should return true for valid address', () => {
      expect(util.isValidHexAddress(VALID)).toBe(true);
    });

    it('should return false for invalid address', () => {
      expect(util.isValidHexAddress('0x00')).toBe(false);
    });

    it('should allow allowNonPrefixed to be false', () => {
      expect(util.isValidHexAddress('0x00', { allowNonPrefixed: false })).toBe(
        false,
      );
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

  it('normalizeMessageData', () => {
    const firstNormalized = util.normalizeMessageData(
      '879a053d4800c6354e76c7985a865d2922c82fb5b3f4577b2fe08b998954f2e0',
    );
    const secondNormalized = util.normalizeMessageData('somedata');
    expect(firstNormalized).toStrictEqual(
      '0x879a053d4800c6354e76c7985a865d2922c82fb5b3f4577b2fe08b998954f2e0',
    );
    expect(secondNormalized).toStrictEqual('0x736f6d6564617461');
  });

  it('messageHexToString', () => {
    const str = util.hexToText('68656c6c6f207468657265');
    expect(str).toStrictEqual('hello there');
  });

  describe('validateSignMessageData', () => {
    it('should throw if no from address', () => {
      expect(() =>
        util.validateSignMessageData({
          data: '0x879a05',
        } as any),
      ).toThrow('Invalid "from" address: undefined must be a valid string.');
    });

    it('should throw if invalid from address', () => {
      expect(() =>
        util.validateSignMessageData({
          data: '0x879a05',
          from: '01',
        } as any),
      ).toThrow('Invalid "from" address: 01 must be a valid string.');
    });

    it('should throw if invalid type from address', () => {
      expect(() =>
        util.validateSignMessageData({
          data: '0x879a05',
          from: 123,
        } as any),
      ).toThrow('Invalid "from" address: 123 must be a valid string.');
    });

    it('should throw if no data', () => {
      expect(() =>
        util.validateSignMessageData({
          data: '0x879a05',
        } as any),
      ).toThrow('Invalid "from" address: undefined must be a valid string.');
    });

    it('should throw if invalid tyoe data', () => {
      expect(() =>
        util.validateSignMessageData({
          data: 123,
          from: '0x3244e191f1b4903970224322180f1fbbc415696b',
        } as any),
      ).toThrow('Invalid message "data": 123 must be a valid string.');
    });
  });

  describe('validateTypedMessageDataV1', () => {
    it('should throw if no from address legacy', () => {
      expect(() =>
        util.validateTypedSignMessageDataV1({
          data: [],
        } as any),
      ).toThrow('Invalid "from" address:');
    });

    it('should throw if invalid from address', () => {
      expect(() =>
        util.validateTypedSignMessageDataV1({
          data: [],
          from: '3244e191f1b4903970224322180f1fbbc415696b',
        } as any),
      ).toThrow('Expected EIP712 typed data.');
    });

    it('should throw if invalid type from address', () => {
      expect(() =>
        util.validateTypedSignMessageDataV1({
          data: [],
          from: 123,
        } as any),
      ).toThrow('Invalid "from" address:');
    });

    it('should throw if incorrect data', () => {
      expect(() =>
        util.validateTypedSignMessageDataV1({
          data: '0x879a05',
          from: '0x3244e191f1b4903970224322180f1fbbc415696b',
        } as any),
      ).toThrow('Invalid message "data":');
    });

    it('should throw if no data', () => {
      expect(() =>
        util.validateTypedSignMessageDataV1({
          data: '0x879a05',
          from: '0x3244e191f1b4903970224322180f1fbbc415696b',
        } as any),
      ).toThrow('Invalid message "data":');
    });

    it('should throw if invalid type data', () => {
      expect(() =>
        util.validateTypedSignMessageDataV1({
          data: [],
          from: '0x3244e191f1b4903970224322180f1fbbc415696b',
        } as any),
      ).toThrow('Expected EIP712 typed data.');
    });
  });

  describe('validateTypedMessageDataV3', () => {
    const dataTyped =
      '{"types":{"EIP712Domain":[{"name":"name","type":"string"},{"name":"version","type":"string"},{"name":"chainId","type":"uint256"},{"name":"verifyingContract","type":"address"}],"Person":[{"name":"name","type":"string"},{"name":"wallet","type":"address"}],"Mail":[{"name":"from","type":"Person"},{"name":"to","type":"Person"},{"name":"contents","type":"string"}]},"primaryType":"Mail","domain":{"name":"Ether Mail","version":"1","chainId":1,"verifyingContract":"0xCcCCccccCCCCcCCCCCCcCcCccCcCCCcCcccccccC"},"message":{"from":{"name":"Cow","wallet":"0xCD2a3d9F938E13CD947Ec05AbC7FE734Df8DD826"},"to":{"name":"Bob","wallet":"0xbBbBBBBbbBBBbbbBbbBbbbbBBbBbbbbBbBbbBBbB"},"contents":"Hello, Bob!"}}';
    it('should throw if no from address', () => {
      expect(() =>
        util.validateTypedSignMessageDataV3({
          data: '0x879a05',
        } as any),
      ).toThrow('Invalid "from" address:');
    });

    it('should throw if invalid from address', () => {
      expect(() =>
        util.validateTypedSignMessageDataV3({
          data: '0x879a05',
          from: '3244e191f1b4903970224322180f1fbbc415696b',
        } as any),
      ).toThrow('Data must be passed as a valid JSON string.');
    });

    it('should throw if invalid type from address', () => {
      expect(() =>
        util.validateTypedSignMessageDataV3({
          data: '0x879a05',
          from: 123,
        } as any),
      ).toThrow('Invalid "from" address:');
    });

    it('should throw if array data', () => {
      expect(() =>
        util.validateTypedSignMessageDataV3({
          data: [],
          from: '0x3244e191f1b4903970224322180f1fbbc415696b',
        } as any),
      ).toThrow('Invalid message "data":');
    });

    it('should throw if no array data', () => {
      expect(() =>
        util.validateTypedSignMessageDataV3({
          from: '0x3244e191f1b4903970224322180f1fbbc415696b',
        } as any),
      ).toThrow('Invalid message "data":');
    });

    it('should throw if no json valid data', () => {
      expect(() =>
        util.validateTypedSignMessageDataV3({
          data: 'uh oh',
          from: '0x3244e191f1b4903970224322180f1fbbc415696b',
        } as any),
      ).toThrow('Data must be passed as a valid JSON string.');
    });

    it('should throw if data not in typed message schema', () => {
      expect(() =>
        util.validateTypedSignMessageDataV3({
          data: '{"greetings":"I am Alice"}',
          from: '0x3244e191f1b4903970224322180f1fbbc415696b',
        } as any),
      ).toThrow('Data must conform to EIP-712 schema.');
    });

    it('should not throw if data is correct', () => {
      expect(() =>
        util.validateTypedSignMessageDataV3({
          data: dataTyped,
          from: '0x3244e191f1b4903970224322180f1fbbc415696b',
        } as any),
      ).not.toThrow();
    });

    it('should identify smart contract code', () => {
      const toSmartContract1 = util.isSmartContractCode('');
      const toSmartContract2 = util.isSmartContractCode('0x');
      const toSmartContract3 = util.isSmartContractCode('0x0');
      const toSmartContract4 = util.isSmartContractCode('0x01234');
      expect(toSmartContract1).toBe(false);
      expect(toSmartContract2).toBe(false);
      expect(toSmartContract3).toBe(false);
      expect(toSmartContract4).toBe(true);
    });
  });

  describe('validateTokenToWatch', () => {
    it('should throw if undefined token atrributes', () => {
      expect(() =>
        util.validateTokenToWatch({
          address: undefined,
          decimals: 0,
          symbol: 'TKN',
        } as any),
      ).toThrow('Must specify address, symbol, and decimals.');

      expect(() =>
        util.validateTokenToWatch({
          address: '0x1',
          decimals: 0,
          symbol: undefined,
        } as any),
      ).toThrow('Must specify address, symbol, and decimals.');

      expect(() =>
        util.validateTokenToWatch({
          address: '0x1',
          decimals: undefined,
          symbol: 'TKN',
        } as any),
      ).toThrow('Must specify address, symbol, and decimals.');
    });

    it('should throw if symbol is not a string', () => {
      expect(() =>
        util.validateTokenToWatch({
          address: '0xe9f786dfdd9be4d57e830acb52296837765f0e5b',
          decimals: 0,
          symbol: { foo: 'bar' },
        } as any),
      ).toThrow('Invalid symbol: not a string.');
    });

    it('should throw if symbol is an empty string', () => {
      expect(() =>
        util.validateTokenToWatch({
          address: '0xe9f786dfdd9be4d57e830acb52296837765f0e5b',
          decimals: 0,
          symbol: '',
        } as any),
      ).toThrow('Must specify address, symbol, and decimals.');
    });

    it('should not throw if symbol is exactly 1 character long', () => {
      expect(() =>
        util.validateTokenToWatch({
          address: '0xe9f786dfdd9be4d57e830acb52296837765f0e5b',
          decimals: 0,
          symbol: 'T',
        } as any),
      ).not.toThrow();
    });

    it('should not throw if symbol is exactly 11 characters long', () => {
      expect(() =>
        util.validateTokenToWatch({
          address: '0xe9f786dfdd9be4d57e830acb52296837765f0e5b',
          decimals: 0,
          symbol: 'TKNTKNTKNTK',
        } as any),
      ).not.toThrow();
    });

    it('should throw if symbol is more than 11 characters long', () => {
      expect(() =>
        util.validateTokenToWatch({
          address: '0xe9f786dfdd9be4d57e830acb52296837765f0e5b',
          decimals: 0,
          symbol: 'TKNTKNTKNTKN',
        } as any),
      ).toThrow('Invalid symbol "TKNTKNTKNTKN": longer than 11 characters.');
    });

    it('should throw if invalid decimals', () => {
      expect(() =>
        util.validateTokenToWatch({
          address: '0xe9f786dfdd9be4d57e830acb52296837765f0e5b',
          decimals: 0,
          symbol: 'TKN',
        } as any),
      ).not.toThrow();

      expect(() =>
        util.validateTokenToWatch({
          address: '0xe9f786dfdd9be4d57e830acb52296837765f0e5b',
          decimals: 38,
          symbol: 'TKN',
        } as any),
      ).toThrow('Invalid decimals "38": must be 0 <= 36.');

      expect(() =>
        util.validateTokenToWatch({
          address: '0xe9f786dfdd9be4d57e830acb52296837765f0e5b',
          decimals: -1,
          symbol: 'TKN',
        } as any),
      ).toThrow('Invalid decimals "-1": must be 0 <= 36.');
    });

    it('should throw if invalid address', () => {
      expect(() =>
        util.validateTokenToWatch({
          address: '0xe9',
          decimals: 0,
          symbol: 'TKN',
        } as any),
      ).toThrow('Invalid address "0xe9".');
    });
  });

  describe('successfulFetch', () => {
    beforeEach(() => {
      nock(SOME_API).get(/.+/u).reply(200, { foo: 'bar' }).persist();
      nock(SOME_FAILING_API).get(/.+/u).reply(500).persist();
    });

    it('should return successful fetch response', async () => {
      const res = await util.successfulFetch(SOME_API);
      const parsed = await res.json();
      expect(parsed).toStrictEqual({ foo: 'bar' });
    });

    it('should throw error for an unsuccessful fetch', async () => {
      let error;
      try {
        await util.successfulFetch(SOME_FAILING_API);
      } catch (e) {
        error = e;
      }

      expect(error.message).toBe(
        `Fetch failed with status '500' for request '${SOME_FAILING_API}'`,
      );
    });
  });

  describe('timeoutFetch', () => {
    beforeEach(() => {
      nock(SOME_API).get(/.+/u).delay(300).reply(200, {}).persist();
    });

    it('should fetch first if response is faster than timeout', async () => {
      const res = await util.timeoutFetch(SOME_API);
      const parsed = await res.json();
      expect(parsed).toStrictEqual({});
    });

    it('should fail fetch with timeout', async () => {
      let error;
      try {
        await util.timeoutFetch(SOME_API, {}, 100);
      } catch (e) {
        error = e;
      }
      expect(error.message).toBe('timeout');
    });
  });

  describe('normalizeEnsName', () => {
    it('should normalize with valid 2LD', async () => {
      let valid = util.normalizeEnsName('metamask.eth');
      expect(valid).toStrictEqual('metamask.eth');
      valid = util.normalizeEnsName('foobar1.eth');
      expect(valid).toStrictEqual('foobar1.eth');
      valid = util.normalizeEnsName('foo-bar.eth');
      expect(valid).toStrictEqual('foo-bar.eth');
      valid = util.normalizeEnsName('1-foo-bar.eth');
      expect(valid).toStrictEqual('1-foo-bar.eth');
    });

    it('should normalize with valid 2LD and "test" TLD', async () => {
      const valid = util.normalizeEnsName('metamask.test');
      expect(valid).toStrictEqual('metamask.test');
    });

    it('should normalize with valid 2LD and 3LD', async () => {
      let valid = util.normalizeEnsName('a.metamask.eth');
      expect(valid).toStrictEqual('a.metamask.eth');
      valid = util.normalizeEnsName('aa.metamask.eth');
      expect(valid).toStrictEqual('aa.metamask.eth');
      valid = util.normalizeEnsName('a-a.metamask.eth');
      expect(valid).toStrictEqual('a-a.metamask.eth');
      valid = util.normalizeEnsName('1-a.metamask.eth');
      expect(valid).toStrictEqual('1-a.metamask.eth');
      valid = util.normalizeEnsName('1-2.metamask.eth');
      expect(valid).toStrictEqual('1-2.metamask.eth');
    });

    it('should return null with invalid 2LD', async () => {
      let invalid = util.normalizeEnsName('me.eth');
      expect(invalid).toBeNull();
      invalid = util.normalizeEnsName('metamask-.eth');
      expect(invalid).toBeNull();
      invalid = util.normalizeEnsName('-metamask.eth');
      expect(invalid).toBeNull();
      invalid = util.normalizeEnsName('@metamask.eth');
      expect(invalid).toBeNull();
      invalid = util.normalizeEnsName('foobar.eth');
      expect(invalid).toBeNull();
    });

    it('should return null with valid 2LD and invalid 3LD', async () => {
      let invalid = util.normalizeEnsName('-.metamask.eth');
      expect(invalid).toBeNull();
      invalid = util.normalizeEnsName('abc-.metamask.eth');
      expect(invalid).toBeNull();
      invalid = util.normalizeEnsName('-abc.metamask.eth');
      expect(invalid).toBeNull();
      invalid = util.normalizeEnsName('.metamask.eth');
      expect(invalid).toBeNull();
      invalid = util.normalizeEnsName('f@o.metamask.eth');
      expect(invalid).toBeNull();
    });

    it('should return null with invalid 2LD and valid 3LD', async () => {
      const invalid = util.normalizeEnsName('foo.barbaz.eth');
      expect(invalid).toBeNull();
    });

    it('should return null with invalid TLD', async () => {
      const invalid = util.normalizeEnsName('a.metamask.com');
      expect(invalid).toBeNull();
    });

    it('should return null with repeated periods', async () => {
      let invalid = util.normalizeEnsName('foo..metamask.eth');
      expect(invalid).toBeNull();
      invalid = util.normalizeEnsName('foo.metamask..eth');
      expect(invalid).toBeNull();
    });

    it('should return null with empty string', async () => {
      const invalid = util.normalizeEnsName('');
      expect(invalid).toBeNull();
    });
  });

  describe('query', () => {
    describe('when the given method exists directly on the EthQuery', () => {
      it('should call the method on the EthQuery and, if it is successful, return a promise that resolves to the result', async () => {
        const ethQuery = {
          getBlockByHash: (blockId: any, cb: any) => cb(null, { id: blockId }),
        };
        const result = await util.query(ethQuery, 'getBlockByHash', ['0x1234']);
        expect(result).toStrictEqual({ id: '0x1234' });
      });

      it('should call the method on the EthQuery and, if it errors, return a promise that is rejected with the error', async () => {
        const ethQuery = {
          getBlockByHash: (_blockId: any, cb: any) =>
            cb(new Error('uh oh'), null),
        };
        await expect(
          util.query(ethQuery, 'getBlockByHash', ['0x1234']),
        ).rejects.toThrow('uh oh');
      });
    });

    describe('when the given method does not exist directly on the EthQuery', () => {
      it('should use sendAsync to call the RPC endpoint and, if it is successful, return a promise that resolves to the result', async () => {
        const ethQuery = {
          sendAsync: ({ method, params }: any, cb: any) => {
            if (method === 'eth_getBlockByHash') {
              return cb(null, { id: params[0] });
            }
            throw new Error(`Unsupported method ${method}`);
          },
        };
        const result = await util.query(ethQuery, 'eth_getBlockByHash', [
          '0x1234',
        ]);
        expect(result).toStrictEqual({ id: '0x1234' });
      });

      it('should use sendAsync to call the RPC endpoint and, if it errors, return a promise that is rejected with the error', async () => {
        const ethQuery = {
          sendAsync: (_args: any, cb: any) => {
            cb(new Error('uh oh'), null);
          },
        };
        await expect(
          util.query(ethQuery, 'eth_getBlockByHash', ['0x1234']),
        ).rejects.toThrow('uh oh');
      });
    });
  });

  describe('convertPriceToDecimal', () => {
    it('should convert hex price to decimal', () => {
      expect(util.convertPriceToDecimal('0x50fd51da')).toStrictEqual(
        1358778842,
      );
    });

    it('should return zero when undefined', () => {
      expect(util.convertPriceToDecimal(undefined)).toStrictEqual(0);
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

  describe('getFormattedIpfsUrl', () => {
    it('should return a correctly formatted subdomained ipfs url when passed ipfsGateway without protocol prefix, no path and subdomainSupported argument set to true', () => {
      expect(
        util.getFormattedIpfsUrl(
          IFPS_GATEWAY,
          `${DEFAULT_IPFS_URL_FORMAT}${IPFS_CID_V1}`,
          true,
        ),
      ).toStrictEqual(`https://${IPFS_CID_V1}.ipfs.${IFPS_GATEWAY}`);
    });

    it('should return a correctly formatted subdomained ipfs url when passed ipfsGateway with protocol prefix, a cidv0 and no path and subdomainSupported argument set to true', () => {
      expect(
        util.getFormattedIpfsUrl(
          `https://${IFPS_GATEWAY}`,
          `${DEFAULT_IPFS_URL_FORMAT}${IPFS_CID_V0}`,
          true,
        ),
      ).toStrictEqual(`https://${IPFS_CID_V1}.ipfs.${IFPS_GATEWAY}`);
    });

    it('should return a correctly formatted subdomained ipfs url when passed ipfsGateway with protocol prefix, a path at the end of the url, and subdomainSupported argument set to true', () => {
      expect(
        util.getFormattedIpfsUrl(
          `https://${IFPS_GATEWAY}`,
          `${DEFAULT_IPFS_URL_FORMAT}${IPFS_CID_V1}/test`,
          true,
        ),
      ).toStrictEqual(`https://${IPFS_CID_V1}.ipfs.${IFPS_GATEWAY}/test`);
    });

    it('should return a correctly formatted non-subdomained ipfs url when passed ipfsGateway with no "/ipfs/" appended, a path at the end of the url, and subdomainSupported argument set to false', () => {
      expect(
        util.getFormattedIpfsUrl(
          `https://${IFPS_GATEWAY}`,
          `${DEFAULT_IPFS_URL_FORMAT}${IPFS_CID_V1}/test`,
          false,
        ),
      ).toStrictEqual(`https://${IFPS_GATEWAY}/ipfs/${IPFS_CID_V1}/test`);
    });

    it('should return a correctly formatted non-subdomained ipfs url when passed an ipfsGateway with "/ipfs/" appended, a path at the end of the url, subdomainSupported argument set to false', () => {
      expect(
        util.getFormattedIpfsUrl(
          `https://${IFPS_GATEWAY}/ipfs/`,
          `${DEFAULT_IPFS_URL_FORMAT}${IPFS_CID_V1}/test`,
          false,
        ),
      ).toStrictEqual(`https://${IFPS_GATEWAY}/ipfs/${IPFS_CID_V1}/test`);
    });
  });

  describe('removeIpfsProtocolPrefix', () => {
    it('should return content identifier and path combined string from default ipfs url format', () => {
      expect(
        util.removeIpfsProtocolPrefix(
          `${DEFAULT_IPFS_URL_FORMAT}${IPFS_CID_V0}/test`,
        ),
      ).toStrictEqual(`${IPFS_CID_V0}/test`);
    });

    it('should return content identifier string from default ipfs url format if no path preset', () => {
      expect(
        util.removeIpfsProtocolPrefix(
          `${DEFAULT_IPFS_URL_FORMAT}${IPFS_CID_V0}`,
        ),
      ).toStrictEqual(IPFS_CID_V0);
    });

    it('should return content identifier string from alternate ipfs url format', () => {
      expect(
        util.removeIpfsProtocolPrefix(
          `${ALTERNATIVE_IPFS_URL_FORMAT}${IPFS_CID_V0}`,
        ),
      ).toStrictEqual(IPFS_CID_V0);
    });

    it('should throw error if passed a non ipfs url', () => {
      expect(() => util.removeIpfsProtocolPrefix(SOME_API)).toThrow(
        'this method should not be used with non ipfs urls',
      );
    });
  });

  describe('addUrlProtocolPrefix', () => {
    it('should return a URL with https:// prepended if input URL does not already have it', () => {
      expect(util.addUrlProtocolPrefix(IFPS_GATEWAY)).toStrictEqual(
        `https://${IFPS_GATEWAY}`,
      );
    });

    it('should return a URL as is if https:// is already prepended', () => {
      expect(util.addUrlProtocolPrefix(SOME_API)).toStrictEqual(SOME_API);
    });
  });

  describe('getIpfsCIDv1AndPath', () => {
    it('should return content identifier from default ipfs url format', () => {
      expect(
        util.getIpfsCIDv1AndPath(`${DEFAULT_IPFS_URL_FORMAT}${IPFS_CID_V0}`),
      ).toStrictEqual({ cid: IPFS_CID_V1, path: undefined });
    });

    it('should return content identifier from alternative ipfs url format', () => {
      expect(
        util.getIpfsCIDv1AndPath(
          `${ALTERNATIVE_IPFS_URL_FORMAT}${IPFS_CID_V0}`,
        ),
      ).toStrictEqual({ cid: IPFS_CID_V1, path: undefined });
    });

    it('should return unchanged content identifier if already v1', () => {
      expect(
        util.getIpfsCIDv1AndPath(`${DEFAULT_IPFS_URL_FORMAT}${IPFS_CID_V1}`),
      ).toStrictEqual({ cid: IPFS_CID_V1, path: undefined });
    });

    it('should return a path when url contains one', () => {
      expect(
        util.getIpfsCIDv1AndPath(
          `${DEFAULT_IPFS_URL_FORMAT}${IPFS_CID_V1}/test/test/test`,
        ),
      ).toStrictEqual({ cid: IPFS_CID_V1, path: '/test/test/test' });
    });
  });
});

describe('isPlainObject', () => {
  it('returns false for null values', () => {
    expect(util.isPlainObject(null)).toBe(false);
    expect(util.isPlainObject(undefined)).toBe(false);
  });

  it('returns false for non objects', () => {
    expect(util.isPlainObject(5)).toBe(false);
    expect(util.isPlainObject('foo')).toBe(false);
  });

  it('returns false for arrays', () => {
    expect(util.isPlainObject(['foo'])).toBe(false);
    expect(util.isPlainObject([{}])).toBe(false);
  });

  it('returns true for objects', () => {
    expect(util.isPlainObject({ foo: 'bar' })).toBe(true);
    expect(util.isPlainObject({ foo: 'bar', test: { num: 5 } })).toBe(true);
  });
});

describe('hasProperty', () => {
  it('returns false for non existing properties', () => {
    expect(util.hasProperty({ foo: 'bar' }, 'property')).toBe(false);
  });

  it('returns true for existing properties', () => {
    expect(util.hasProperty({ foo: 'bar' }, 'foo')).toBe(true);
  });
});

describe('isNonEmptyArray', () => {
  it('returns false non arrays', () => {
    // @ts-expect-error Invalid type for testing purposes
    expect(util.isNonEmptyArray(null)).toBe(false);
    // @ts-expect-error Invalid type for testing purposes
    expect(util.isNonEmptyArray(undefined)).toBe(false);
  });

  it('returns false for empty array', () => {
    expect(util.isNonEmptyArray([])).toBe(false);
  });

  it('returns true arrays with at least one item', () => {
    expect(util.isNonEmptyArray([1])).toBe(true);
    expect(util.isNonEmptyArray([1, 2, 3, 4])).toBe(true);
  });
});

describe('isValidJson', () => {
  it('returns false for class instances', () => {
    expect(util.isValidJson(new Map())).toBe(false);
  });

  it('returns true for valid JSON', () => {
    expect(util.isValidJson({ foo: 'bar', test: { num: 5 } })).toBe(true);
  });
});
