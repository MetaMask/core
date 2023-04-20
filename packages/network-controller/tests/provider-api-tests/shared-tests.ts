import { NetworkType } from '@metamask/controller-utils';
import { testsForRpcMethodsThatCheckForBlockHashInResponse } from './block-hash-in-response';
import { testsForRpcMethodSupportingBlockParam } from './block-param';
import {
  ProviderType,
  withMockedCommunications,
  withNetworkClient,
} from './helpers';
import { testsForRpcMethodAssumingNoBlockParam } from './no-block-param';
import { testsForRpcMethodNotHandledByMiddleware } from './not-handled-by-middleware';

/**
 * Constructs an error message that the Infura client would produce in the event
 * that it has attempted to retry the request to Infura and has failed.
 *
 * @param reason - The exact reason for failure.
 * @returns The error message.
 */
export function buildInfuraClientRetriesExhaustedErrorMessage(reason: string) {
  return new RegExp(
    `^InfuraProvider - cannot complete request. All retries exhausted\\..+${reason}`,
    'us',
  );
}

/**
 * Constructs an error message that JsonRpcEngine would produce in the event
 * that the response object is empty as it leaves the middleware.
 *
 * @param method - The RPC method.
 * @returns The error message.
 */
export function buildJsonRpcEngineEmptyResponseErrorMessage(method: string) {
  return new RegExp(
    `^JsonRpcEngine: Response has no error or result for request:.+"method": "${method}"`,
    'us',
  );
}

/**
 * Constructs an error message that `fetch` with throw if it cannot make a
 * request.
 *
 * @param url - The URL being fetched
 * @param reason - The reason.
 * @returns The error message.
 */
export function buildFetchFailedErrorMessage(url: string, reason: string) {
  return new RegExp(
    `^request to ${url}(/[^/ ]*)+ failed, reason: ${reason}`,
    'us',
  );
}

export const testsForProviderType = (providerType: ProviderType) => {
  describe('methods included in the Ethereum JSON-RPC spec', () => {
    describe('methods not handled by middleware', () => {
      const notHandledByMiddleware = [
        { name: 'eth_accounts', numberOfParameters: 0 },
        { name: 'eth_coinbase', numberOfParameters: 0 },
        { name: 'eth_createAccessList', numberOfParameters: 2 },
        { name: 'eth_feeHistory', numberOfParameters: 3 },
        { name: 'eth_getFilterChanges', numberOfParameters: 1 },
        { name: 'eth_getLogs', numberOfParameters: 1 },
        { name: 'eth_getProof', numberOfParameters: 3 },
        { name: 'eth_getWork', numberOfParameters: 0 },
        { name: 'eth_hashrate', numberOfParameters: 0 },
        { name: 'eth_maxPriorityFeePerGas', numberOfParameters: 0 },
        { name: 'eth_mining', numberOfParameters: 0 },
        { name: 'eth_newBlockFilter', numberOfParameters: 0 },
        { name: 'eth_newFilter', numberOfParameters: 1 },
        { name: 'eth_newPendingTransactionFilter', numberOfParameters: 0 },
        { name: 'eth_sendRawTransaction', numberOfParameters: 1 },
        { name: 'eth_signTransaction', numberOfParameters: 1 },
        { name: 'eth_sendTransaction', numberOfParameters: 1 },
        { name: 'eth_sign', numberOfParameters: 2 },
        { name: 'eth_submitHashRate', numberOfParameters: 2 },
        { name: 'eth_submitWork', numberOfParameters: 3 },
        { name: 'eth_syncing', numberOfParameters: 0 },
        { name: 'eth_uninstallFilter', numberOfParameters: 1 },
        { name: 'debug_getRawHeader', numberOfParameters: 1 },
        { name: 'debug_getRawBlock', numberOfParameters: 1 },
        { name: 'debug_getRawTransaction', numberOfParameters: 1 },
        { name: 'debug_getRawReceipts', numberOfParameters: 1 },
        { name: 'debug_getBadBlocks', numberOfParameters: 0 },
      ];
      notHandledByMiddleware.forEach(({ name, numberOfParameters }) => {
        describe(`method name: ${name}`, () => {
          testsForRpcMethodNotHandledByMiddleware(name, {
            providerType,
            numberOfParameters,
          });
        });
      });
    });

    describe('methods with block hashes in their result', () => {
      const methodsWithBlockHashInResponse = [
        { method: 'eth_getTransactionByHash', numberOfParameters: 1 },
        { method: 'eth_getTransactionReceipt', numberOfParameters: 1 },
      ];

      methodsWithBlockHashInResponse.forEach(
        ({ method, numberOfParameters }) => {
          describe(`method name: ${method}`, () => {
            testsForRpcMethodsThatCheckForBlockHashInResponse(method, {
              providerType,
              numberOfParameters,
            });
          });
        },
      );
    });

    describe('methods that assume there is no block param', () => {
      const assumingNoBlockParam = [
        { name: 'eth_blockNumber', numberOfParameters: 0 },
        { name: 'eth_estimateGas', numberOfParameters: 2 },
        { name: 'eth_gasPrice', numberOfParameters: 0 },
        { name: 'eth_getBlockByHash', numberOfParameters: 2 },
        // NOTE: eth_getBlockTransactionCountByNumber does take a block param at
        // the 0th index, but this is not handled by our cache middleware
        // currently
        {
          name: 'eth_getBlockTransactionCountByNumber',
          numberOfParameters: 1,
        },
        // NOTE: eth_getTransactionByBlockNumberAndIndex does take a block param
        // at the 0th index, but this is not handled by our cache middleware
        // currently
        {
          name: 'eth_getTransactionByBlockNumberAndIndex',
          numberOfParameters: 2,
        },
        {
          name: 'eth_getBlockTransactionCountByHash',
          numberOfParameters: 1,
        },
        { name: 'eth_getFilterLogs', numberOfParameters: 1 },
        {
          name: 'eth_getTransactionByBlockHashAndIndex',
          numberOfParameters: 2,
        },
        { name: 'eth_getUncleByBlockHashAndIndex', numberOfParameters: 2 },
        // NOTE: eth_getUncleByBlockNumberAndIndex does take a block param at
        // the 0th index, but this is not handled by our cache middleware
        // currently
        { name: 'eth_getUncleByBlockNumberAndIndex', numberOfParameters: 2 },
        { name: 'eth_getUncleCountByBlockHash', numberOfParameters: 1 },
        // NOTE: eth_getUncleCountByBlockNumber does take a block param at the
        // 0th index, but this is not handled by our cache middleware currently
        { name: 'eth_getUncleCountByBlockNumber', numberOfParameters: 1 },
      ];
      assumingNoBlockParam.forEach(({ name, numberOfParameters }) =>
        describe(`method name: ${name}`, () => {
          testsForRpcMethodAssumingNoBlockParam(name, {
            providerType,
            numberOfParameters,
          });
        }),
      );
    });

    describe('methods that have a param to specify the block', () => {
      const supportingBlockParam = [
        {
          name: 'eth_call',
          blockParamIndex: 1,
          numberOfParameters: 2,
        },
        {
          name: 'eth_getBalance',
          blockParamIndex: 1,
          numberOfParameters: 2,
        },
        {
          name: 'eth_getBlockByNumber',
          blockParamIndex: 0,
          numberOfParameters: 2,
        },
        { name: 'eth_getCode', blockParamIndex: 1, numberOfParameters: 2 },
        {
          name: 'eth_getStorageAt',
          blockParamIndex: 2,
          numberOfParameters: 3,
        },
        {
          name: 'eth_getTransactionCount',
          blockParamIndex: 1,
          numberOfParameters: 2,
        },
      ];
      supportingBlockParam.forEach(
        ({ name, blockParamIndex, numberOfParameters }) => {
          describe(`method name: ${name}`, () => {
            testsForRpcMethodSupportingBlockParam(name, {
              providerType,
              blockParamIndex,
              numberOfParameters,
            });
          });
        },
      );
    });

    describe('other methods', () => {
      describe('eth_getTransactionByHash', () => {
        it("refreshes the block tracker's current block if it is less than the block number that comes back in the response", async () => {
          const method = 'eth_getTransactionByHash';

          await withMockedCommunications({ providerType }, async (comms) => {
            const request = { method };

            comms.mockNextBlockTrackerRequest({ blockNumber: '0x100' });
            // This is our request.
            comms.mockRpcCall({
              request,
              response: {
                result: {
                  blockNumber: '0x200',
                },
              },
            });
            comms.mockNextBlockTrackerRequest({ blockNumber: '0x300' });

            await withNetworkClient(
              { providerType },
              async ({ makeRpcCall, blockTracker }) => {
                await makeRpcCall(request);
                expect(blockTracker.getCurrentBlock()).toStrictEqual('0x300');
              },
            );
          });
        });
      });

      describe('eth_getTransactionReceipt', () => {
        it("refreshes the block tracker's current block if it is less than the block number that comes back in the response", async () => {
          const method = 'eth_getTransactionReceipt';

          await withMockedCommunications({ providerType }, async (comms) => {
            const request = { method };

            comms.mockNextBlockTrackerRequest({ blockNumber: '0x100' });
            // This is our request.
            comms.mockRpcCall({
              request,
              response: {
                result: {
                  blockNumber: '0x200',
                },
              },
            });
            comms.mockNextBlockTrackerRequest({ blockNumber: '0x300' });

            await withNetworkClient(
              { providerType },
              async ({ makeRpcCall, blockTracker }) => {
                await makeRpcCall(request);
                expect(blockTracker.getCurrentBlock()).toStrictEqual('0x300');
              },
            );
          });
        });
      });

      describe('eth_chainId', () => {
        it('does not hit the RPC endpoint, instead returning the configured chain id', async () => {
          await withMockedCommunications({ providerType }, async () => {
            const request = { method: 'eth_chainId', customChainId: '0x1' };

            const networkId = await withNetworkClient(
              { providerType },
              ({ makeRpcCall }) => {
                return makeRpcCall(request);
              },
            );

            expect(networkId).toStrictEqual('0x1');
          });
        });
      });
    });
  });

  describe('methods not included in the Ethereum JSON-RPC spec', () => {
    describe('methods not handled by middleware', () => {
      const notHandledByMiddleware = [
        { name: 'eth_subscribe', numberOfParameters: 1 },
        { name: 'eth_unsubscribe', numberOfParameters: 1 },
        { name: 'custom_rpc_method', numberOfParameters: 1 },
        { name: 'net_listening', numberOfParameters: 0 },
        { name: 'net_peerCount', numberOfParameters: 0 },
        { name: 'parity_nextNonce', numberOfParameters: 1 },
      ];
      notHandledByMiddleware.forEach(({ name, numberOfParameters }) => {
        describe(`method name: ${name}`, () => {
          testsForRpcMethodNotHandledByMiddleware(name, {
            providerType,
            numberOfParameters,
          });
        });
      });
    });

    describe('methods that assume there is no block param', () => {
      const assumingNoBlockParam = [
        { name: 'eth_protocolVersion', numberOfParameters: 0 },
        { name: 'web3_clientVersion', numberOfParameters: 0 },
      ];
      assumingNoBlockParam.forEach(({ name, numberOfParameters }) =>
        describe(`method name: ${name}`, () => {
          testsForRpcMethodAssumingNoBlockParam(name, {
            providerType,
            numberOfParameters,
          });
        }),
      );
    });

    describe('other methods', () => {
      describe('net_version', () => {
        // The Infura middleware includes `net_version` in its scaffold
        // middleware, whereas the custom RPC middleware does not.
        if (providerType === 'infura') {
          it('does not hit Infura, instead returning the network ID that maps to the Infura network, as a decimal string', async () => {
            const networkId = await withNetworkClient(
              { providerType: 'infura', infuraNetwork: NetworkType.goerli },
              ({ makeRpcCall }) => {
                return makeRpcCall({
                  method: 'net_version',
                });
              },
            );
            expect(networkId).toStrictEqual('5');
          });
        } else {
          it('hits the RPC endpoint', async () => {
            await withMockedCommunications(
              { providerType: 'custom' },
              async (comms) => {
                comms.mockRpcCall({
                  request: { method: 'net_version' },
                  response: { result: '1' },
                });

                const networkId = await withNetworkClient(
                  { providerType: 'custom' },
                  ({ makeRpcCall }) => {
                    return makeRpcCall({
                      method: 'net_version',
                    });
                  },
                );

                expect(networkId).toStrictEqual('1');
              },
            );
          });
        }
      });
    });
  });
};
