import {
  blockTagForRequest,
  blockTagParamIndex,
  cacheTypeForMethod,
  cacheIdentifierForRequest,
  canCache,
} from './cache';

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
  describe('cacheIdentifierForRequest', () => {
    it('returns null for an unrecognized method', () => {
      const identifier = cacheIdentifierForRequest({
        id: 1,
        jsonrpc: '2.0',
        method: 'this_method_does_not_exist',
        params: [],
      });

      expect(identifier).toBeNull();
    });

    describe('skipBlockRef disabled', () => {
      it('returns cache identifier for request with no params property', () => {
        const identifier = cacheIdentifierForRequest({
          id: 1,
          jsonrpc: '2.0',
          method: 'eth_gasPrice',
        });

        expect(identifier).toMatchInlineSnapshot(`"eth_gasPrice:[]"`);
      });

      it('returns cache identifier for request with empty parameters', () => {
        const identifier = cacheIdentifierForRequest({
          id: 1,
          jsonrpc: '2.0',
          method: 'eth_gasPrice',
          params: [],
        });

        expect(identifier).toMatchInlineSnapshot(`"eth_gasPrice:[]"`);
      });

      describe('array parameters', () => {
        it('returns cache identifier for request that does not accept any block parameter', () => {
          const identifier = cacheIdentifierForRequest({
            id: 1,
            jsonrpc: '2.0',
            method: 'eth_getBlockByHash',
            params: ['0x0000000000000000000000000000000000000000'],
          });

          expect(identifier).toMatchInlineSnapshot(
            `"eth_getBlockByHash:[\\"0x0000000000000000000000000000000000000000\\"]"`,
          );
        });

        it('returns cache identifier for request that includes a block parameter first', () => {
          const identifier = cacheIdentifierForRequest({
            id: 1,
            jsonrpc: '2.0',
            method: 'eth_getBlockByNumber',
            params: ['latest'],
          });

          expect(identifier).toMatchInlineSnapshot(
            `"eth_getBlockByNumber:[\\"latest\\"]"`,
          );
        });

        it('returns cache identifier for request that includes a block parameter first with some additional parameter', () => {
          const identifier = cacheIdentifierForRequest({
            id: 1,
            jsonrpc: '2.0',
            method: 'eth_getBlockByNumber',
            params: ['latest', true],
          });

          expect(identifier).toMatchInlineSnapshot(
            `"eth_getBlockByNumber:[\\"latest\\",true]"`,
          );
        });

        it('returns cache identifier for request that includes a block parameter last after some additional parameter', () => {
          const identifier = cacheIdentifierForRequest(
            {
              id: 1,
              jsonrpc: '2.0',
              method: 'eth_getBalance',
              params: ['0x0000000000000000000000000000000000000000', 'latest'],
            },
            true,
          );

          expect(identifier).toMatchInlineSnapshot(
            `"eth_getBalance:[\\"0x0000000000000000000000000000000000000000\\"]"`,
          );
        });

        it('returns cache identifier for request with a missing block parameter', () => {
          const identifier = cacheIdentifierForRequest({
            id: 1,
            jsonrpc: '2.0',
            method: 'eth_getCode',
            params: ['0x0000000000000000000000000000000000000000'],
          });

          expect(identifier).toMatchInlineSnapshot(
            `"eth_getCode:[\\"0x0000000000000000000000000000000000000000\\"]"`,
          );
        });
      });

      describe('object parameters', () => {
        it('returns cache identifier for request that does not accept any block parameter', () => {
          const identifier = cacheIdentifierForRequest({
            id: 1,
            jsonrpc: '2.0',
            method: 'eth_getBlockByHash',
            // Note that this is not a valid request, this is just to test how this middleware handles object params.
            params: { hash: '0x0000000000000000000000000000000000000000' },
          });

          expect(identifier).toMatchInlineSnapshot(
            `"eth_getBlockByHash:{\\"hash\\":\\"0x0000000000000000000000000000000000000000\\"}"`,
          );
        });

        it('returns cache identifier for request that includes a block parameter first', () => {
          const identifier = cacheIdentifierForRequest({
            id: 1,
            jsonrpc: '2.0',
            method: 'eth_getBlockByNumber',
            // Note that this is not a valid request, this is just to test how this middleware handles object params.
            params: { block: 'latest' },
          });

          expect(identifier).toMatchInlineSnapshot(
            `"eth_getBlockByNumber:{\\"block\\":\\"latest\\"}"`,
          );
        });

        it('returns cache identifier for request that includes a block parameter first with some additional parameter', () => {
          const identifier = cacheIdentifierForRequest({
            id: 1,
            jsonrpc: '2.0',
            method: 'eth_getBlockByNumber',
            // Note that this is not a valid request, this is just to test how this middleware handles object params.
            params: { block: 'latest', showTransactionDetails: true },
          });

          expect(identifier).toMatchInlineSnapshot(
            `"eth_getBlockByNumber:{\\"block\\":\\"latest\\",\\"showTransactionDetails\\":true}"`,
          );
        });

        it('returns cache identifier for request that includes a block parameter last after some additional parameter', () => {
          const identifier = cacheIdentifierForRequest({
            id: 1,
            jsonrpc: '2.0',
            method: 'eth_getBalance',
            // Note that this is not a valid request, this is just to test how this middleware handles object params.
            params: {
              address: '0x0000000000000000000000000000000000000000',
              block: 'latest',
            },
          });

          expect(identifier).toMatchInlineSnapshot(
            `"eth_getBalance:{\\"address\\":\\"0x0000000000000000000000000000000000000000\\",\\"block\\":\\"latest\\"}"`,
          );
        });

        it('returns cache identifier for request with a missing block parameter', () => {
          const identifier = cacheIdentifierForRequest({
            id: 1,
            jsonrpc: '2.0',
            method: 'eth_getCode',
            // Note that this is not a valid request, this is just to test how this middleware handles object params.
            params: { data: '0x0000000000000000000000000000000000000000' },
          });

          expect(identifier).toMatchInlineSnapshot(
            `"eth_getCode:{\\"data\\":\\"0x0000000000000000000000000000000000000000\\"}"`,
          );
        });
      });
    });

    describe('skipBlockRef enabled', () => {
      it('returns cache identifier for request with no params property', () => {
        const identifier = cacheIdentifierForRequest(
          {
            id: 1,
            jsonrpc: '2.0',
            method: 'eth_gasPrice',
          },
          true,
        );

        expect(identifier).toMatchInlineSnapshot(`"eth_gasPrice:[]"`);
      });

      it('returns cache identifier for request with empty parameters', () => {
        const identifier = cacheIdentifierForRequest(
          {
            id: 1,
            jsonrpc: '2.0',
            method: 'eth_gasPrice',
            params: [],
          },
          true,
        );

        expect(identifier).toMatchInlineSnapshot(`"eth_gasPrice:[]"`);
      });

      describe('array parameters', () => {
        it('returns cache identifier for request that does not accept any block parameter', () => {
          const identifier = cacheIdentifierForRequest(
            {
              id: 1,
              jsonrpc: '2.0',
              method: 'eth_getBlockByHash',
              params: ['0x0000000000000000000000000000000000000000'],
            },
            true,
          );

          expect(identifier).toMatchInlineSnapshot(
            `"eth_getBlockByHash:[\\"0x0000000000000000000000000000000000000000\\"]"`,
          );
        });

        it('returns cache identifier for request that includes a block parameter first', () => {
          const identifier = cacheIdentifierForRequest(
            {
              id: 1,
              jsonrpc: '2.0',
              method: 'eth_getBlockByNumber',
              params: ['latest'],
            },
            true,
          );

          expect(identifier).toMatchInlineSnapshot(`"eth_getBlockByNumber:[]"`);
        });

        it('returns cache identifier for request that includes a block parameter first with some additional parameter', () => {
          const identifier = cacheIdentifierForRequest(
            {
              id: 1,
              jsonrpc: '2.0',
              method: 'eth_getBlockByNumber',
              params: ['latest', true],
            },
            true,
          );

          expect(identifier).toMatchInlineSnapshot(
            `"eth_getBlockByNumber:[true]"`,
          );
        });

        it('returns cache identifier for request that includes a block parameter last after some additional parameter', () => {
          const identifier = cacheIdentifierForRequest(
            {
              id: 1,
              jsonrpc: '2.0',
              method: 'eth_getBalance',
              params: ['0x0000000000000000000000000000000000000000', 'latest'],
            },
            true,
          );

          expect(identifier).toMatchInlineSnapshot(
            `"eth_getBalance:[\\"0x0000000000000000000000000000000000000000\\"]"`,
          );
        });

        it('returns cache identifier for request with a missing block parameter', () => {
          const identifier = cacheIdentifierForRequest(
            {
              id: 1,
              jsonrpc: '2.0',
              method: 'eth_getCode',
              params: ['0x0000000000000000000000000000000000000000'],
            },
            true,
          );

          expect(identifier).toMatchInlineSnapshot(
            `"eth_getCode:[\\"0x0000000000000000000000000000000000000000\\"]"`,
          );
        });
      });

      describe('object parameters', () => {
        it('returns cache identifier for request that does not accept any block parameter', () => {
          const identifier = cacheIdentifierForRequest(
            {
              id: 1,
              jsonrpc: '2.0',
              method: 'eth_getBlockByHash',
              // Note that this is not a valid request, this is just to test how this middleware handles object params.
              params: { hash: '0x0000000000000000000000000000000000000000' },
            },
            true,
          );

          expect(identifier).toMatchInlineSnapshot(
            `"eth_getBlockByHash:{\\"hash\\":\\"0x0000000000000000000000000000000000000000\\"}"`,
          );
        });

        it('returns cache identifier for request that includes a block parameter first', () => {
          const identifier = cacheIdentifierForRequest(
            {
              id: 1,
              jsonrpc: '2.0',
              method: 'eth_getBlockByNumber',
              // Note that this is not a valid request, this is just to test how this middleware handles object params.
              params: { block: 'latest' },
            },
            true,
          );

          expect(identifier).toMatchInlineSnapshot(
            `"eth_getBlockByNumber:{\\"block\\":\\"latest\\"}"`,
          );
        });

        it('returns cache identifier for request that includes a block parameter first with some additional parameter', () => {
          const identifier = cacheIdentifierForRequest(
            {
              id: 1,
              jsonrpc: '2.0',
              method: 'eth_getBlockByNumber',
              // Note that this is not a valid request, this is just to test how this middleware handles object params.
              params: { block: 'latest', showTransactionDetails: true },
            },
            true,
          );

          expect(identifier).toMatchInlineSnapshot(
            `"eth_getBlockByNumber:{\\"block\\":\\"latest\\",\\"showTransactionDetails\\":true}"`,
          );
        });

        it('returns cache identifier for request that includes a block parameter last after some additional parameter', () => {
          const identifier = cacheIdentifierForRequest(
            {
              id: 1,
              jsonrpc: '2.0',
              method: 'eth_getBalance',
              // Note that this is not a valid request, this is just to test how this middleware handles object params.
              params: {
                address: '0x0000000000000000000000000000000000000000',
                block: 'latest',
              },
            },
            true,
          );

          expect(identifier).toMatchInlineSnapshot(
            `"eth_getBalance:{\\"address\\":\\"0x0000000000000000000000000000000000000000\\",\\"block\\":\\"latest\\"}"`,
          );
        });

        it('returns cache identifier for request with a missing block parameter', () => {
          const identifier = cacheIdentifierForRequest(
            {
              id: 1,
              jsonrpc: '2.0',
              method: 'eth_getCode',
              // Note that this is not a valid request, this is just to test how this middleware handles object params.
              params: { data: '0x0000000000000000000000000000000000000000' },
            },
            true,
          );

          expect(identifier).toMatchInlineSnapshot(
            `"eth_getCode:{\\"data\\":\\"0x0000000000000000000000000000000000000000\\"}"`,
          );
        });
      });
    });
  });

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

  describe('blockTagForRequest', () => {
    it('should return undefined for a request with no parameters', () => {
      const blockTag = blockTagForRequest({
        id: 1,
        jsonrpc: '2.0',
        method: 'eth_getBlockByNumber',
      });

      expect(blockTag).toBeUndefined();
    });

    it('should return undefined for an unrecognized method', () => {
      const blockTag = blockTagForRequest({
        id: 1,
        jsonrpc: '2.0',
        method: 'this_method_does_not_exist',
        params: ['latest'],
      });

      expect(blockTag).toBeUndefined();
    });

    it('should return undefined for a method with no block parameter', () => {
      const blockTag = blockTagForRequest({
        id: 1,
        jsonrpc: '2.0',
        method: 'eth_gasPrice',
        params: ['latest'],
      });

      expect(blockTag).toBeUndefined();
    });

    it('should return undefined for a request that has object parameters', () => {
      const blockTag = blockTagForRequest({
        id: 1,
        jsonrpc: '2.0',
        // `eth_getBlockByNumber` chosen because it is recognized as having a block parameter, at
        // index 0. It's not a realistic test of this behavior because it doesn't accept params as
        // an object, but none of the methods supported by this middleware do.
        method: 'eth_getBlockByNumber',
        params: { block: 'latest' },
      });

      expect(blockTag).toBeUndefined();
    });

    it('should return undefined for a request where the block parameter is missing', () => {
      const blockTag = blockTagForRequest({
        id: 1,
        jsonrpc: '2.0',
        method: 'eth_getTransactionCount',
        params: ['0x0000000000000000000000000000000000000000'],
      });

      expect(blockTag).toBeUndefined();
    });

    it('should return the block parameter', () => {
      const blockTag = blockTagForRequest({
        id: 1,
        jsonrpc: '2.0',
        method: 'eth_getTransactionCount',
        params: ['0x0000000000000000000000000000000000000000', 'latest'],
      });

      expect(blockTag).toBe('latest');
    });
  });

  describe('blockTagParamIndex', () => {
    it(`should return expected block index for each known method`, () => {
      const blockTagIndexes = knownMethods.reduce<
        Record<string, number | undefined>
      >((indexes, method) => {
        indexes[method] = blockTagParamIndex(method);
        return indexes;
      }, {});

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
      const cacheTypes = knownMethods.reduce<Record<string, string>>(
        (types, method) => {
          types[method] = cacheTypeForMethod(method);
          return types;
        },
        {},
      );

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
