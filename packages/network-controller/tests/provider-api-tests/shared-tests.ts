/* eslint-disable jest/require-top-level-describe, jest/no-export, jest/no-identical-title, jest/no-if */

import { NetworkType } from '@metamask/controller-utils';
import { testsForRpcMethodsThatCheckForBlockHashInResponse } from './block-hash-in-response';
import { testsForRpcMethodSupportingBlockParam } from './block-param';
import {
  ProviderType,
  waitForNextBlockTracker,
  withMockedCommunications,
  withNetworkClient,
} from './helpers';
import { testsForRpcMethodAssumingNoBlockParam } from './no-block-param';
import { testsForRpcMethodNotHandledByMiddleware } from './not-handled-by-middleware';
import { testsForRpcMethodWithStaticResult } from './static-results';

export const buildInfuraClientRetriesExhaustedErrorMessage = (
  reason: string,
) => {
  return new RegExp(
    `^InfuraProvider - cannot complete request. All retries exhausted\\..+${reason}`,
    'us',
  );
};

export const buildFetchFailedErrorMessage = (url: string, reason: string) => {
  return new RegExp(
    `^request to ${url}(/[^/ ]*)+ failed, reason: ${reason}`,
    'us',
  );
};

export const testsForProviderType = (providerType: ProviderType) => {
  describe('methods included in the Ethereum JSON-RPC spec', () => {
    describe('methods not handled by middleware', () => {
      const notHandledByMiddleware = [
        // { name: 'eth_newFilter', numberOfParameters: 1 },
        // { name: 'eth_getFilterChanges', numberOfParameters: 1 },
        // { name: 'eth_newBlockFilter', numberOfParameters: 0 },
        // { name: 'eth_newPendingTransactionFilter', numberOfParameters: 0 },
        // { name: 'eth_uninstallFilter', numberOfParameters: 1 },

        // { name: 'eth_sendRawTransaction', numberOfParameters: 1 },
        // { name: 'eth_sendTransaction', numberOfParameters: 1 },
        // { name: 'eth_sign', numberOfParameters: 2 },

        { name: 'eth_createAccessList', numberOfParameters: 2 },
        { name: 'eth_getLogs', numberOfParameters: 1 },
        { name: 'eth_getProof', numberOfParameters: 3 },
        { name: 'eth_getWork', numberOfParameters: 0 },
        { name: 'eth_maxPriorityFeePerGas', numberOfParameters: 0 },
        { name: 'eth_submitHashRate', numberOfParameters: 2 },
        { name: 'eth_submitWork', numberOfParameters: 3 },
        { name: 'eth_syncing', numberOfParameters: 0 },
        { name: 'eth_feeHistory', numberOfParameters: 3 },
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

    describe('methods handled by middleware that returns a static result', () => {
      const notHandledByMiddleware = [
        { name: 'eth_accounts', numberOfParameters: 0, result: [] },
        { name: 'eth_coinbase', numberOfParameters: 0, result: null },
        { name: 'eth_hashrate', numberOfParameters: 0, result: '0x00' },
        { name: 'eth_mining', numberOfParameters: 0, result: false },
      ];
      notHandledByMiddleware.forEach(({ name, numberOfParameters, result }) => {
        describe(`method name: ${name}`, () => {
          testsForRpcMethodWithStaticResult(name, {
            providerType,
            numberOfParameters,
            result,
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
        // { name: 'eth_getFilterLogs', numberOfParameters: 1 },
        // { name: 'eth_blockNumber', numberOfParameters: 0 },
        { name: 'eth_estimateGas', numberOfParameters: 2 },
        { name: 'eth_gasPrice', numberOfParameters: 0 },
        { name: 'eth_getBlockByHash', numberOfParameters: 2 },
        {
          name: 'eth_getBlockTransactionCountByHash',
          numberOfParameters: 1,
        },
        {
          name: 'eth_getTransactionByBlockHashAndIndex',
          numberOfParameters: 2,
        },
        { name: 'eth_getUncleByBlockHashAndIndex', numberOfParameters: 2 },
        { name: 'eth_getUncleCountByBlockHash', numberOfParameters: 1 },
      ];

      // NOTE: these methods do take a block param
      // but this is not handled by our cache middleware currently
      const blockParamIgnored = [
        { name: 'eth_getUncleCountByBlockNumber', numberOfParameters: 1 },
        { name: 'eth_getUncleByBlockNumberAndIndex', numberOfParameters: 2 },
        {
          name: 'eth_getTransactionByBlockNumberAndIndex',
          numberOfParameters: 2,
        },
        {
          name: 'eth_getBlockTransactionCountByNumber',
          numberOfParameters: 1,
        },
      ];

      assumingNoBlockParam
        .concat(blockParamIgnored)
        .forEach(({ name, numberOfParameters }) =>
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
              async ({ makeRpcCall, clock, blockTracker }) => {
                await makeRpcCall(request);
                await waitForNextBlockTracker(blockTracker, clock);
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
              async ({ makeRpcCall, blockTracker, clock }) => {
                await makeRpcCall(request);
                await waitForNextBlockTracker(blockTracker, clock);
                expect(blockTracker.getCurrentBlock()).toStrictEqual('0x300');
              },
            );
          });
        });
      });

      describe('eth_chainId', () => {
        it('does not hit the RPC endpoint, instead returning the configured chain id', async () => {
          await withMockedCommunications({ providerType }, async (comms) => {
            const request = { method: 'eth_chainId' };
            comms.mockRpcCall({
              request,
              response: {
                result: '0x1',
              },
            });

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

      describe('eth_signTransaction', () => {
        it('throws an error', async () => {
          const address = '0x0000000000000000000000000000000000000000';
          const dummyTransaction = {
            from: address,
            to: address,
            gasLimit: '21000',
            maxFeePerGas: '300',
            maxPriorityFeePerGas: '10',
            nonce: '0',
            value: '10000000000',
          };
          const request = {
            method: 'eth_signTransaction',
            params: [dummyTransaction],
          };
          const expectedResult = `Unknown address - unable to sign transaction for this address: "${address}"`;

          await withMockedCommunications({ providerType }, async (comms) => {
            comms.mockNextBlockTrackerRequest({ blockNumber: '0x1' });

            const promiseForResult = withNetworkClient(
              { providerType },
              async ({ makeRpcCall }) => makeRpcCall(request),
            );

            await expect(promiseForResult).rejects.toThrow(expectedResult);
          });
        });
      });
    });
  });

  describe('methods not included in the Ethereum JSON-RPC spec', () => {
    describe('methods handled by middleware that returns a static result', () => {
      const notHandledByMiddleware = [
        { name: 'net_listening', numberOfParameters: 0, result: true },
        {
          name: 'web3_clientVersion',
          numberOfParameters: 0,
          result: 'ProviderEngine/v16.0.3/javascript',
        },
      ];
      notHandledByMiddleware.forEach(({ name, numberOfParameters, result }) => {
        describe(`method name: ${name}`, () => {
          testsForRpcMethodWithStaticResult(name, {
            providerType,
            numberOfParameters,
            result,
          });
        });
      });
    });

    describe('methods not handled by middleware', () => {
      const notHandledByMiddleware = [
        // { name: 'eth_subscribe', numberOfParameters: 1 },
        // { name: 'eth_unsubscribe', numberOfParameters: 1 },
        { name: 'custom_rpc_method', numberOfParameters: 1 },
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
        it('does hit RPC endpoint to get net_version', async () => {
          await withMockedCommunications(
            { providerType, infuraNetwork: NetworkType.goerli },
            async (comms) => {
              comms.mockRpcCall({
                request: { method: 'net_version' },
                response: { result: '5' },
              });
              const networkId = await withNetworkClient(
                { providerType, infuraNetwork: NetworkType.goerli },
                ({ makeRpcCall }) => {
                  return makeRpcCall({
                    method: 'net_version',
                  });
                },
              );
              expect(networkId).toStrictEqual('5');
            },
          );
        });
      });
    });
  });
};
