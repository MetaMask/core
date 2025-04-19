import { NetworkClientType } from '../src/types';
import { testsForProviderType } from './provider-api-tests/shared-tests';

for (const clientType of Object.values(NetworkClientType)) {
  if (clientType !== 'custom') {
    continue;
  }

  describe(`createNetworkClient - ${clientType}`, () => {
    testsForProviderType(clientType);
  });
}
