import { blockTagParamIndex, cacheTypeForMethod, canCache } from './cache';

const knownMethods = [
  'web3_clientVersion',
  'web3_sha3',
  'eth_protocolVersion',
  'eth_getBlockTransactionCountByHash',
  'eth_getUncleCountByBlockHash',
  'eth_getCode',
  'eth_getBlockByHash',
  'eth_getTransactionByHash',
  'eth_getTransactionByBlockHashAndIndex',
  'eth_getTransactionReceipt',
  'eth_getUncleByBlockHashAndIndex',
  'eth_getCompilers',
  'eth_compileLLL',
  'eth_compileSolidity',
  'eth_compileSerpent',
  'shh_version',
  'test_permaCache',
  'eth_getBlockByNumber',
  'eth_getBlockTransactionCountByNumber',
  'eth_getUncleCountByBlockNumber',
  'eth_getTransactionByBlockNumberAndIndex',
  'eth_getUncleByBlockNumberAndIndex',
  'test_forkCache',
  'eth_gasPrice',
  'eth_blockNumber',
  'eth_getBalance',
  'eth_getStorageAt',
  'eth_getTransactionCount',
  'eth_call',
  'eth_estimateGas',
  'eth_getFilterLogs',
  'eth_getLogs',
  'test_blockCache',
];

describe('cache utils', () => {
  describe('canCache', () => {
    for (const method of knownMethods) {
      it(`should be able to cache '${method}'`, () => {
        expect(canCache(method)).toBe(true);
      });
    }

    it('should not be able to cache an unknown method', () => {
      expect(canCache('this_method_does_not_exist')).toBe(false);
    });
  });

  describe('blockTagParamIndex', () => {
    it(`should return expected block index for each known method`, () => {
      const blockTagIndexes = knownMethods.reduce((indexes, method) => {
        indexes[method] = blockTagParamIndex(method);
        return indexes;
      }, {} as Record<string, number | undefined>);

      expect(blockTagIndexes).toMatchInlineSnapshot(`
        Object {
          "eth_blockNumber": undefined,
          "eth_call": 1,
          "eth_compileLLL": undefined,
          "eth_compileSerpent": undefined,
          "eth_compileSolidity": undefined,
          "eth_estimateGas": undefined,
          "eth_gasPrice": undefined,
          "eth_getBalance": 1,
          "eth_getBlockByHash": undefined,
          "eth_getBlockByNumber": 0,
          "eth_getBlockTransactionCountByHash": undefined,
          "eth_getBlockTransactionCountByNumber": undefined,
          "eth_getCode": 1,
          "eth_getCompilers": undefined,
          "eth_getFilterLogs": undefined,
          "eth_getLogs": undefined,
          "eth_getStorageAt": 2,
          "eth_getTransactionByBlockHashAndIndex": undefined,
          "eth_getTransactionByBlockNumberAndIndex": undefined,
          "eth_getTransactionByHash": undefined,
          "eth_getTransactionCount": 1,
          "eth_getTransactionReceipt": undefined,
          "eth_getUncleByBlockHashAndIndex": undefined,
          "eth_getUncleByBlockNumberAndIndex": undefined,
          "eth_getUncleCountByBlockHash": undefined,
          "eth_getUncleCountByBlockNumber": undefined,
          "eth_protocolVersion": undefined,
          "shh_version": undefined,
          "test_blockCache": undefined,
          "test_forkCache": undefined,
          "test_permaCache": undefined,
          "web3_clientVersion": undefined,
          "web3_sha3": undefined,
        }
      `);
    });

    it('should return "undefined" for an unrecognized method', () => {
      const index = blockTagParamIndex('this_method_does_not_exist');

      expect(index).toBeUndefined();
    });
  });

  describe('cacheTypeForMethod', () => {
    it(`should return expected cache type for each known method`, () => {
      const cacheTypes = knownMethods.reduce((types, method) => {
        types[method] = cacheTypeForMethod(method);
        return types;
      }, {} as Record<string, string>);

      expect(cacheTypes).toMatchInlineSnapshot(`
        Object {
          "eth_blockNumber": "block",
          "eth_call": "block",
          "eth_compileLLL": "perma",
          "eth_compileSerpent": "perma",
          "eth_compileSolidity": "perma",
          "eth_estimateGas": "block",
          "eth_gasPrice": "block",
          "eth_getBalance": "block",
          "eth_getBlockByHash": "perma",
          "eth_getBlockByNumber": "fork",
          "eth_getBlockTransactionCountByHash": "perma",
          "eth_getBlockTransactionCountByNumber": "fork",
          "eth_getCode": "perma",
          "eth_getCompilers": "perma",
          "eth_getFilterLogs": "block",
          "eth_getLogs": "block",
          "eth_getStorageAt": "block",
          "eth_getTransactionByBlockHashAndIndex": "perma",
          "eth_getTransactionByBlockNumberAndIndex": "fork",
          "eth_getTransactionByHash": "perma",
          "eth_getTransactionCount": "block",
          "eth_getTransactionReceipt": "perma",
          "eth_getUncleByBlockHashAndIndex": "perma",
          "eth_getUncleByBlockNumberAndIndex": "fork",
          "eth_getUncleCountByBlockHash": "perma",
          "eth_getUncleCountByBlockNumber": "fork",
          "eth_protocolVersion": "perma",
          "shh_version": "perma",
          "test_blockCache": "block",
          "test_forkCache": "fork",
          "test_permaCache": "perma",
          "web3_clientVersion": "perma",
          "web3_sha3": "perma",
        }
      `);
    });

    it('should return "never" for an unrecognized method', () => {
      const index = cacheTypeForMethod('this_method_does_not_exist');

      expect(index).toBe('never');
    });
  });
});
