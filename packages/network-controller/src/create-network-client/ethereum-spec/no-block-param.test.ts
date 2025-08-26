import { testsForRpcMethodAssumingNoBlockParam } from '../../../tests/network-client/no-block-param';
import { NetworkClientType } from '../../types';

describe('createNetworkClient - methods included in the Ethereum JSON-RPC spec - methods that assume there is no block param', () => {
  for (const networkClientType of Object.values(NetworkClientType)) {
    describe(`${networkClientType}`, () => {
      const assumingNoBlockParam = [
        { name: 'eth_getFilterLogs', numberOfParameters: 1 },
        { name: 'eth_blockNumber', numberOfParameters: 0 },
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
          describe(`${name}`, () => {
            testsForRpcMethodAssumingNoBlockParam(name, {
              providerType: networkClientType,
              numberOfParameters,
            });
          }),
        );
    });
  }
});
