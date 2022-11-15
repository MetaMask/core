import { BN } from 'ethereumjs-util';
import nock from 'nock';
import * as util from './util';

const VALID = '4e1fF7229BDdAf0A73DF183a88d9c3a04cc975e0';
const SOME_API = 'https://someapi.com';
const SOME_FAILING_API = 'https://somefailingapi.com';

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
      expect(util.toHex(new BN(4919))).toBe('0x1337');
    });

    it('parses a string as a number in decimal format and converts it to a hex string prepended with "0x"', () => {
      expect(util.toHex('4919')).toBe('0x1337');
    });

    it('throws an error if given a string with decimals', () => {
      expect(() => util.toHex('4919.3')).toThrow('Invalid character');
    });

    it('converts a number to a hex string prepended with "0x"', () => {
      expect(util.toHex(4919)).toBe('0x1337');
    });

    it('throws an error if given a float', () => {
      expect(() => util.toHex(4919.3)).toThrow('Invalid character');
    });

    it('does nothing to a string that is already a "0x"-prepended hex value', () => {
      expect(util.toHex('0x1337')).toBe('0x1337');
    });

    it('throws an error if given a non-"0x"-prepended string that is not a valid hex value', () => {
      expect(() => util.toHex('zzzz')).toThrow('Invalid character');
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
      const response = await util.safelyExecuteWithTimeout(async () => {
        return new Promise((res) => setTimeout(() => res('response'), 200));
      });
      expect(response).toBe('response');
    });

    it('should timeout', async () => {
      expect(
        await util.safelyExecuteWithTimeout(async () => {
          return new Promise((res) => setTimeout(res, 800));
        }),
      ).toBeUndefined();
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

  it('messageHexToString', () => {
    const str = util.hexToText('68656c6c6f207468657265');
    expect(str).toBe('hello there');
  });

  it('isSmartContractCode', () => {
    const toSmartContract1 = util.isSmartContractCode('');
    const toSmartContract2 = util.isSmartContractCode('0x');
    const toSmartContract3 = util.isSmartContractCode('0x0');
    const toSmartContract4 = util.isSmartContractCode('0x01234');
    expect(toSmartContract1).toBe(false);
    expect(toSmartContract2).toBe(false);
    expect(toSmartContract3).toBe(false);
    expect(toSmartContract4).toBe(true);
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
      await expect(util.successfulFetch(SOME_FAILING_API)).rejects.toThrow(
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
      await expect(util.timeoutFetch(SOME_API, {}, 100)).rejects.toThrow(
        'timeout',
      );
    });
  });

  describe('normalizeEnsName', () => {
    it('should normalize with valid 2LD', async () => {
      let valid = util.normalizeEnsName('metamask.eth');
      expect(valid).toBe('metamask.eth');
      valid = util.normalizeEnsName('foobar1.eth');
      expect(valid).toBe('foobar1.eth');
      valid = util.normalizeEnsName('foo-bar.eth');
      expect(valid).toBe('foo-bar.eth');
      valid = util.normalizeEnsName('1-foo-bar.eth');
      expect(valid).toBe('1-foo-bar.eth');
    });

    it('should normalize with valid 2LD and "test" TLD', async () => {
      const valid = util.normalizeEnsName('metamask.test');
      expect(valid).toBe('metamask.test');
    });

    it('should normalize with valid 2LD and 3LD', async () => {
      let valid = util.normalizeEnsName('a.metamask.eth');
      expect(valid).toBe('a.metamask.eth');
      valid = util.normalizeEnsName('aa.metamask.eth');
      expect(valid).toBe('aa.metamask.eth');
      valid = util.normalizeEnsName('a-a.metamask.eth');
      expect(valid).toBe('a-a.metamask.eth');
      valid = util.normalizeEnsName('1-a.metamask.eth');
      expect(valid).toBe('1-a.metamask.eth');
      valid = util.normalizeEnsName('1-2.metamask.eth');
      expect(valid).toBe('1-2.metamask.eth');
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

  describe('convertHexToDecimal', () => {
    it('should convert hex price to decimal', () => {
      expect(util.convertHexToDecimal('0x50fd51da')).toBe(1358778842);
    });

    it('should return zero when undefined', () => {
      expect(util.convertHexToDecimal(undefined)).toBe(0);
    });

    it('should return a decimal string as the same decimal number', () => {
      expect(util.convertHexToDecimal('1611')).toBe(1611);
    });

    it('should return 0 when passed an invalid hex string', () => {
      expect(util.convertHexToDecimal('0x12398u12')).toBe(0);
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
});
