import { testsForRpcMethodAssumingNoBlockParam } from '../../../tests/network-client/no-block-param';
import { NetworkClientType } from '../../types';

describe('createNetworkClient - methods not included in the Ethereum JSON-RPC spec - methods that assume there is no block param', () => {
  for (const networkClientType of Object.values(NetworkClientType)) {
    describe(`${networkClientType}`, () => {
      const assumingNoBlockParam = [
        { name: 'web3_clientVersion', numberOfParameters: 0 },
        { name: 'eth_protocolVersion', numberOfParameters: 0 },
      ];
      assumingNoBlockParam.forEach(({ name, numberOfParameters }) =>
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
