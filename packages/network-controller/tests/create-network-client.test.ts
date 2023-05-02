import { NetworkClientType } from '../src/create-network-client';
import { testsForProviderType } from './provider-api-tests/shared-tests';

describe('createNetworkClient', () => {
  testsForProviderType(NetworkClientType.Infura);
  testsForProviderType(NetworkClientType.Custom);
});
