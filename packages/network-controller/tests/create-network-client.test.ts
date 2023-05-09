import { NetworkClientType } from '../src/create-network-client';
import { testsForProviderType } from './provider-api-tests/shared-tests';

for (const clientType of Object.values(NetworkClientType)) {
  describe(`createNetworkClient - ${clientType}`, () => {
    testsForProviderType(clientType);
  });
}
