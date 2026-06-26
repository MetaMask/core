import { testsForRpcMethodNotHandledByMiddleware } from '../../../tests/network-client/not-handled-by-middleware';
import { NetworkClientType } from '../../types';

describe('createNetworkClient - methods not included in the Ethereum JSON-RPC spec - methods not handled by middleware', () => {
  for (const networkClientType of Object.values(NetworkClientType)) {
    describe(`${networkClientType}`, () => {
      const notHandledByMiddleware = [
        { name: 'net_listening', numberOfParameters: 0 },
        { name: 'eth_subscribe', numberOfParameters: 1 },
        { name: 'eth_unsubscribe', numberOfParameters: 1 },
        { name: 'custom_rpc_method', numberOfParameters: 1 },
        { name: 'net_peerCount', numberOfParameters: 0 },
        { name: 'parity_nextNonce', numberOfParameters: 1 },
      ];
      notHandledByMiddleware.forEach(({ name, numberOfParameters }) => {
        describe(`${name}`, () => {
          testsForRpcMethodNotHandledByMiddleware(name, {
            providerType: networkClientType,
            numberOfParameters,
          });
        });
      });
    });
  }
});
