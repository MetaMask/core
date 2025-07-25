import { testsForProviderType } from './provider-api-tests/shared-tests';
import { NetworkClientType } from '../src/types';

for (const clientType of Object.values(NetworkClientType)) {
  describe(`createNetworkClient - ${clientType}`, () => {
    testsForProviderType(clientType);
  });
}
