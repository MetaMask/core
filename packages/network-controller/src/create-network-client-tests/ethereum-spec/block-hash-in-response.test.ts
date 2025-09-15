import { testsForRpcMethodsThatCheckForBlockHashInResponse } from '../../../tests/network-client/block-hash-in-response';
import { NetworkClientType } from '../../types';

describe('createNetworkClient - methods included in the Ethereum JSON-RPC spec - methods with block hashes in their result', () => {
  for (const networkClientType of Object.values(NetworkClientType)) {
    describe(`${networkClientType}`, () => {
      const methodsWithBlockHashInResponse = [
        { name: 'eth_getTransactionByHash', numberOfParameters: 1 },
        { name: 'eth_getTransactionReceipt', numberOfParameters: 1 },
      ];
      methodsWithBlockHashInResponse.forEach(({ name, numberOfParameters }) => {
        describe(`${name}`, () => {
          testsForRpcMethodsThatCheckForBlockHashInResponse(name, {
            numberOfParameters,
            providerType: networkClientType,
          });
        });
      });
    });
  }
});
