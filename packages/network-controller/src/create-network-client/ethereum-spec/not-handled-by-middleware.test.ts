import { testsForRpcMethodNotHandledByMiddleware } from '../../../tests/network-client/not-handled-by-middleware';
import { NetworkClientType } from '../../types';

describe('createNetworkClient - methods included in the Ethereum JSON-RPC spec - methods not handled by middleware', () => {
  for (const networkClientType of [
    NetworkClientType.Infura,
    NetworkClientType.Custom,
  ]) {
    const notHandledByMiddleware = [
      { name: 'eth_newFilter', numberOfParameters: 1 },
      { name: 'eth_getFilterChanges', numberOfParameters: 1 },
      { name: 'eth_newBlockFilter', numberOfParameters: 0 },
      { name: 'eth_newPendingTransactionFilter', numberOfParameters: 0 },
      { name: 'eth_uninstallFilter', numberOfParameters: 1 },

      { name: 'eth_sendRawTransaction', numberOfParameters: 1 },
      { name: 'eth_sendTransaction', numberOfParameters: 1 },
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

      { name: 'eth_accounts', numberOfParameters: 0 },
      { name: 'eth_coinbase', numberOfParameters: 0 },
      { name: 'eth_hashrate', numberOfParameters: 0 },
      { name: 'eth_mining', numberOfParameters: 0 },

      { name: 'eth_signTransaction', numberOfParameters: 1 },
    ];
    notHandledByMiddleware.forEach(({ name, numberOfParameters }) => {
      // This is a valid title.
      // eslint-disable-next-line jest/valid-title
      describe(name, () => {
        testsForRpcMethodNotHandledByMiddleware(name, {
          providerType: networkClientType,
          numberOfParameters,
        });
      });
    });
  }
});
