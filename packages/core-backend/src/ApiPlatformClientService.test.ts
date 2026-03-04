import { Messenger, MOCK_ANY_NAMESPACE } from '@metamask/messenger';
import type {
  MessengerActions,
  MessengerEvents,
  MockAnyNamespace,
} from '@metamask/messenger';

import { ApiPlatformClientService } from './ApiPlatformClientService';
import type { ApiPlatformClientServiceMessenger } from './ApiPlatformClientService';

type AllApiPlatformClientServiceActions =
  MessengerActions<ApiPlatformClientServiceMessenger>;
type AllApiPlatformClientServiceEvents =
  MessengerEvents<ApiPlatformClientServiceMessenger>;

type RootMessenger = Messenger<
  MockAnyNamespace,
  AllApiPlatformClientServiceActions,
  AllApiPlatformClientServiceEvents
>;

function getRootMessenger(): RootMessenger {
  return new Messenger({
    namespace: MOCK_ANY_NAMESPACE,
  });
}

describe('ApiPlatformClientService', () => {
  describe('ApiPlatformClientService:getApiPlatformClient', () => {
    it('returns the same ApiPlatformClient instance on each call', () => {
      const rootMessenger = getRootMessenger();
      const serviceMessenger: ApiPlatformClientServiceMessenger = new Messenger<
        'ApiPlatformClientService',
        AllApiPlatformClientServiceActions,
        AllApiPlatformClientServiceEvents,
        RootMessenger
      >({
        namespace: 'ApiPlatformClientService',
        parent: rootMessenger,
      });

      const _service = new ApiPlatformClientService({
        messenger: serviceMessenger,
        clientProduct: 'test-product',
      });
      expect(_service.name).toBe('ApiPlatformClientService');

      const client1 = rootMessenger.call(
        'ApiPlatformClientService:getApiPlatformClient',
      );
      const client2 = rootMessenger.call(
        'ApiPlatformClientService:getApiPlatformClient',
      );

      expect(client1).toBe(client2);
    });

    it('returns an ApiPlatformClient with accounts, prices, token, and tokens sub-clients', () => {
      const rootMessenger = getRootMessenger();
      const serviceMessenger: ApiPlatformClientServiceMessenger = new Messenger<
        'ApiPlatformClientService',
        AllApiPlatformClientServiceActions,
        AllApiPlatformClientServiceEvents,
        RootMessenger
      >({
        namespace: 'ApiPlatformClientService',
        parent: rootMessenger,
      });

      const _service = new ApiPlatformClientService({
        messenger: serviceMessenger,
        clientProduct: 'test-product',
      });
      expect(_service.name).toBe('ApiPlatformClientService');

      const client = rootMessenger.call(
        'ApiPlatformClientService:getApiPlatformClient',
      );

      expect(client).toHaveProperty('accounts');
      expect(client).toHaveProperty('prices');
      expect(client).toHaveProperty('token');
      expect(client).toHaveProperty('tokens');
      expect(typeof client.accounts.fetchV5MultiAccountBalances).toBe(
        'function',
      );
      expect(typeof client.prices.fetchV3SpotPrices).toBe('function');
      expect(typeof client.token.fetchTokenList).toBe('function');
      expect(typeof client.tokens.fetchV3Assets).toBe('function');
    });
  });
});
