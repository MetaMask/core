import 'isomorphic-fetch';
import * as fetchMock from 'fetch-mock';

import * as util from '../src/util';

const { BN } = require('ethereumjs-util');

const SOME_API = 'https://someapi.com';
const SOME_FAILING_API = 'https://somefailingapi.com';
const HttpProvider = require('ethjs-provider-http');
const EthQuery = require('eth-query');

const mockFlags: { [key: string]: any } = {
  estimateGas: null,
  gasPrice: null,
};
const PROVIDER = new HttpProvider('https://ropsten.infura.io/v3/341eacb578dd44a1a049cbc5f6fd4035');

jest.mock('eth-query', () =>
  jest.fn().mockImplementation(() => {
    return {
      estimateGas: (_transaction: any, callback: any) => {
        callback(undefined, '0x0');
      },
      gasPrice: (callback: any) => {
        if (mockFlags.gasPrice) {
          callback(new Error(mockFlags.gasPrice));
          return;
        }
        callback(undefined, '0x0');
      },
      getBlockByNumber: (_blocknumber: any, _fetchTxs: boolean, callback: any) => {
        callback(undefined, { gasLimit: '0x0' });
      },
      getCode: (_to: any, callback: any) => {
        callback(undefined, '0x0');
      },
      getTransactionByHash: (_hash: any, callback: any) => {
        callback(undefined, { blockNumber: '0x1' });
      },
      getTransactionCount: (_from: any, _to: any, callback: any) => {
        callback(undefined, '0x0');
      },
      sendRawTransaction: (_transaction: any, callback: any) => {
        callback(undefined, '1337');
      },
    };
  }),
);

describe('util', () => {
  beforeEach(() => {
    fetchMock.reset();
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
    expect(util.getBuyURL('42')).toBe('https://github.com/kovan-testnet/faucet');
  });

  it('hexToBN', () => {
    expect(util.hexToBN('0x1337').toNumber()).toBe(4919);
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
    });
    expect(normalized).toEqual({
      data: '0xdata',
      from: '0xfrom',
      gas: '0xgas',
      gasPrice: '0xgasPrice',
      nonce: '0xnonce',
      to: '0xto',
      value: '0xvalue',
    });
  });

  describe('safelyExecute', () => {
    it('should swallow errors', async () => {
      await util.safelyExecute(() => {
        throw new Error('ahh');
      });
    });

    it('should call retry function', () => {
      return new Promise((resolve) => {
        util.safelyExecute(
          () => {
            throw new Error('ahh');
          },
          false,
          resolve,
        );
      });
    });
  });

  describe('safelyExecuteWithTimeout', () => {
    it('should swallow errors', async () => {
      await util.safelyExecuteWithTimeout(() => {
        throw new Error('ahh');
      });
    });

    it('should resolve', async () => {
      const response = await util.safelyExecuteWithTimeout(() => {
        return new Promise((res) => setTimeout(() => res('response'), 200));
      });
      expect(response).toEqual('response');
    });

    it('should timeout', () => {
      try {
        util.safelyExecuteWithTimeout(() => {
          return new Promise((res) => setTimeout(res, 800));
        });
      } catch (e) {
        expect(e.message).toContain('timeout');
      }
    });
  });

  describe('getEtherscanApiUrl', () => {
    const networkType = 'mainnet';
    const address = '0xC7D3BFDeA106B446Cf9f2Db354D496e6Dd8b2525';
    const action = 'txlist';

    it('should return a correctly structured url', () => {
      const url = util.getEtherscanApiUrl(networkType, address, action);
      expect(url.indexOf(action)).toBeGreaterThan(0);
      expect(url.indexOf(`&action=${action}`)).toBeGreaterThan(0);
    });
    it('should return a correctly structured url with from block', () => {
      const fromBlock = 'xxxxxx';
      const url = util.getEtherscanApiUrl(networkType, address, action, fromBlock);
      expect(url.indexOf(`&startBlock=${fromBlock}`)).toBeGreaterThan(0);
    });
    it('should return a correctly structured url with testnet subdomain', () => {
      const ropsten = 'ropsten';
      const url = util.getEtherscanApiUrl(ropsten, address, action);
      expect(url.indexOf(`https://api-${ropsten}`)).toBe(0);
    });
    it('should return a correctly structured url with apiKey', () => {
      const apiKey = 'xxxxxx';
      const url = util.getEtherscanApiUrl(networkType, address, action, 'xxxxxx', apiKey);
      expect(url.indexOf(`&apikey=${apiKey}`)).toBeGreaterThan(0);
    });
  });

  describe('validateTransaction', () => {
    it('should throw if no from address', () => {
      expect(() => util.validateTransaction({} as any)).toThrow();
    });

    it('should throw if non-string from address', () => {
      expect(() => util.validateTransaction({ from: 1337 } as any)).toThrow();
    });

    it('should throw if invalid from address', () => {
      expect(() => util.validateTransaction({ from: '1337' } as any)).toThrow();
    });

    it('should throw if no data', () => {
      expect(() =>
        util.validateTransaction({
          from: '0x3244e191f1b4903970224322180f1fbbc415696b',
          to: '0x',
        } as any),
      ).toThrow();
      expect(() =>
        util.validateTransaction({
          from: '0x3244e191f1b4903970224322180f1fbbc415696b',
        } as any),
      ).toThrow();
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
      ).toThrow();
    });

    it('should throw if value is invalid', () => {
      expect(() =>
        util.validateTransaction({
          from: '0x3244e191f1b4903970224322180f1fbbc415696b',
          to: '0x3244e191f1b4903970224322180f1fbbc415696b',
          value: '133-7',
        } as any),
      ).toThrow();
      expect(() =>
        util.validateTransaction({
          from: '0x3244e191f1b4903970224322180f1fbbc415696b',
          to: '0x3244e191f1b4903970224322180f1fbbc415696b',
          value: '133.7',
        } as any),
      ).toThrow();
      expect(() =>
        util.validateTransaction({
          from: '0x3244e191f1b4903970224322180f1fbbc415696b',
          to: '0x3244e191f1b4903970224322180f1fbbc415696b',
          value: 'hello',
        } as any),
      ).toThrow();
      expect(() =>
        util.validateTransaction({
          from: '0x3244e191f1b4903970224322180f1fbbc415696b',
          to: '0x3244e191f1b4903970224322180f1fbbc415696b',
          value: 'one million dollar$',
        } as any),
      ).toThrow();
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
    expect(firstNormalized).toEqual('0x879a053d4800c6354e76c7985a865d2922c82fb5b3f4577b2fe08b998954f2e0');
    expect(secondNormalized).toEqual('0x736f6d6564617461');
  });

  it('messageHexToString', () => {
    const str = util.hexToText('68656c6c6f207468657265');
    expect(str).toEqual('hello there');
  });

  describe('validateSignMessageData', () => {
    it('should throw if no from address', () => {
      expect(() =>
        util.validateSignMessageData({
          data: '0x879a05',
        } as any),
      ).toThrow();
    });

    it('should throw if invalid from address', () => {
      expect(() =>
        util.validateSignMessageData({
          data: '0x879a05',
          from: '3244e191f1b4903970224322180f1fbbc415696b',
        } as any),
      ).toThrow();
    });

    it('should throw if invalid type from address', () => {
      expect(() =>
        util.validateSignMessageData({
          data: '0x879a05',
          from: 123,
        } as any),
      ).toThrow();
    });

    it('should throw if no data', () => {
      expect(() =>
        util.validateSignMessageData({
          data: '0x879a05',
        } as any),
      ).toThrow();
    });

    it('should throw if invalid tyoe data', () => {
      expect(() =>
        util.validateSignMessageData({
          data: 123,
          from: '0x3244e191f1b4903970224322180f1fbbc415696b',
        } as any),
      ).toThrow();
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
      ).toThrow('Invalid "from" address:');
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
      ).toThrow('Invalid "from" address:');
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

    it('should throw if symbol is more than 6 characters long', () => {
      expect(() =>
        util.validateTokenToWatch({
          address: '0xe9f786dfdd9be4d57e830acb52296837765f0e5b',
          decimals: 0,
          symbol: 'TKNTKNTKN',
        } as any),
      ).toThrow('Invalid symbol "TKNTKNTKN": longer than 6 characters.');
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
      fetchMock
        .mock(SOME_API, new Response(JSON.stringify({ foo: 'bar' }), { status: 200 }))
        .mock(SOME_FAILING_API, new Response('response', { status: 500 }));
    });

    it('should return successful fetch response', async () => {
      const res = await util.successfulFetch(SOME_API);
      const parsed = await res.json();
      expect(parsed).toEqual({ foo: 'bar' });
    });

    it('should throw error for an unsuccessful fetch', async () => {
      let error;
      try {
        await util.successfulFetch(SOME_FAILING_API);
      } catch (e) {
        error = e;
      }
      expect(error.message).toBe(`Fetch failed with status '500' for request '${SOME_FAILING_API}'`);
    });
  });

  describe('timeoutFetch', () => {
    const delay = (time: number) => {
      return new Promise((resolve) => {
        setTimeout(resolve, time);
      });
    };

    beforeEach(() => {
      fetchMock.mock(SOME_API, () => {
        return delay(300).then(() => {
          return JSON.stringify({});
        });
      });
    });

    it('should fetch first if response is faster than timeout', async () => {
      const res = await util.timeoutFetch(SOME_API);
      const parsed = await res.json();
      expect(parsed).toEqual({});
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
      expect(valid).toEqual('metamask.eth');
      valid = util.normalizeEnsName('foobar1.eth');
      expect(valid).toEqual('foobar1.eth');
      valid = util.normalizeEnsName('foo-bar.eth');
      expect(valid).toEqual('foo-bar.eth');
      valid = util.normalizeEnsName('1-foo-bar.eth');
      expect(valid).toEqual('1-foo-bar.eth');
    });

    it('should normalize with valid 2LD and "test" TLD', async () => {
      const valid = util.normalizeEnsName('metamask.test');
      expect(valid).toEqual('metamask.test');
    });

    it('should normalize with valid 2LD and 3LD', async () => {
      let valid = util.normalizeEnsName('a.metamask.eth');
      expect(valid).toEqual('a.metamask.eth');
      valid = util.normalizeEnsName('aa.metamask.eth');
      expect(valid).toEqual('aa.metamask.eth');
      valid = util.normalizeEnsName('a-a.metamask.eth');
      expect(valid).toEqual('a-a.metamask.eth');
      valid = util.normalizeEnsName('1-a.metamask.eth');
      expect(valid).toEqual('1-a.metamask.eth');
      valid = util.normalizeEnsName('1-2.metamask.eth');
      expect(valid).toEqual('1-2.metamask.eth');
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
    it('should query and resolve', async () => {
      const ethQuery = new EthQuery(PROVIDER);
      const gasPrice = await util.query(ethQuery, 'gasPrice', []);
      expect(gasPrice).toEqual('0x0');
    });

    it('should query and reject if error', async () => {
      const ethQuery = new EthQuery(PROVIDER);
      mockFlags.gasPrice = 'Uh oh';
      try {
        await util.query(ethQuery, 'gasPrice', []);
      } catch (error) {
        expect(error.message).toContain('Uh oh');
      }
    });
  });
});
