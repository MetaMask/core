import { NetworkClientType } from '../src/types';
import { testsForProviderType } from './provider-api-tests/shared-tests';

for (const clientType of Object.values(NetworkClientType).slice(0, 1)) {
  describe(`createNetworkClient - ${clientType}`, () => {
    testsForProviderType(clientType);
  });
}
