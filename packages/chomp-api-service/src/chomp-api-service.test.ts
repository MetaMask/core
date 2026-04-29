import { DEFAULT_MAX_RETRIES } from '@metamask/controller-utils';
import { Messenger, MOCK_ANY_NAMESPACE } from '@metamask/messenger';
import type {
  MockAnyNamespace,
  MessengerActions,
  MessengerEvents,
} from '@metamask/messenger';
import nock from 'nock';

import type { ChompApiServiceMessenger } from './chomp-api-service';
import { ChompApiService } from './chomp-api-service';

const BASE_URL = 'https://api.chomp.example.com';
const MOCK_TOKEN = 'mock-jwt-token';

describe('ChompApiService', () => {
  describe('associateAddress', () => {
    const associateParams = {
      signature: '0x123' as const,
      timestamp: 1735689600,
      address: '0xabc' as const,
    };

    it('sends a POST with auth headers and returns the response on 201', async () => {
      nock(BASE_URL)
        .post('/v1/auth/address', associateParams)
        .matchHeader('Authorization', `Bearer ${MOCK_TOKEN}`)
        .matchHeader('Content-Type', 'application/json')
        .reply(201, {
          profileId: 'p1',
          address: '0xabc',
          status: 'created',
        });
      const { rootMessenger } = createService();

      const result = await rootMessenger.call(
        'ChompApiService:associateAddress',
        associateParams,
      );

      expect(result).toStrictEqual({
        profileId: 'p1',
        address: '0xabc',
        status: 'created',
      });
    });

    it('returns the response on 409 without throwing', async () => {
      nock(BASE_URL).post('/v1/auth/address').reply(409, {
        address: '0xabc',
        status: 'active',
      });
      const { service } = createService();

      const result = await service.associateAddress(associateParams);

      expect(result).toStrictEqual({
        address: '0xabc',
        status: 'active',
      });
    });

    it('throws on non-201/409 status', async () => {
      nock(BASE_URL)
        .post('/v1/auth/address')
        .times(DEFAULT_MAX_RETRIES + 1)
        .reply(500);
      const { service } = createService();

      await expect(service.associateAddress(associateParams)).rejects.toThrow(
        "POST /v1/auth/address failed with status '500'",
      );
    });

    it('throws on malformed response', async () => {
      nock(BASE_URL)
        .post('/v1/auth/address')
        .reply(201, JSON.stringify({ missing: 'fields' }));
      const { service } = createService();

      await expect(service.associateAddress(associateParams)).rejects.toThrow(
        'At path: address',
      );
    });
  });

  describe('createUpgrade', () => {
    const upgradeParams = {
      r: '0x1' as const,
      s: '0x2' as const,
      v: 27,
      yParity: 0,
      address: '0xabc' as const,
      chainId: '1',
      nonce: '0',
    };

    const upgradeResponse = {
      signerAddress: '0xdef',
      address: '0xabc',
      chainId: '0xa4b1',
      nonce: '0x0',
      status: 'pending',
      createdAt: '2026-01-01T00:00:00Z',
    };

    it('sends a POST with auth headers and returns the response', async () => {
      nock(BASE_URL)
        .post('/v1/account-upgrade', upgradeParams)
        .matchHeader('Authorization', `Bearer ${MOCK_TOKEN}`)
        .reply(200, upgradeResponse);
      const { rootMessenger } = createService();

      const result = await rootMessenger.call(
        'ChompApiService:createUpgrade',
        upgradeParams,
      );

      expect(result).toStrictEqual(upgradeResponse);
    });

    it('throws on non-OK status', async () => {
      nock(BASE_URL)
        .post('/v1/account-upgrade')
        .times(DEFAULT_MAX_RETRIES + 1)
        .reply(500);
      const { service } = createService();

      await expect(service.createUpgrade(upgradeParams)).rejects.toThrow(
        "POST /v1/account-upgrade failed with status '500'",
      );
    });

    it('throws on malformed response', async () => {
      nock(BASE_URL)
        .post('/v1/account-upgrade')
        .reply(200, JSON.stringify({ bad: 'data' }));
      const { service } = createService();

      await expect(service.createUpgrade(upgradeParams)).rejects.toThrow(
        'At path: signerAddress -- Expected a string',
      );
    });
  });

  describe('getUpgrades', () => {
    const upgradeEntry = {
      signerAddress: '0xdef',
      chainId: '0xa4b1',
      nonce: '0x0',
      authorization: {
        r: '0x1',
        s: '0x2',
        v: 27,
        yParity: 0,
        address: '0xabc',
        chainId: '0xa4b1',
        nonce: '0x0',
      },
      status: 'pending',
      createdAt: '2026-01-01T00:00:00Z',
    };

    it('sends a GET with auth headers and returns the upgrade entries', async () => {
      nock(BASE_URL)
        .get('/v1/account-upgrade/0xabc')
        .matchHeader('Authorization', `Bearer ${MOCK_TOKEN}`)
        .reply(200, [upgradeEntry]);
      const { rootMessenger } = createService();

      const result = await rootMessenger.call(
        'ChompApiService:getUpgrades',
        '0xabc',
      );

      expect(result).toStrictEqual([upgradeEntry]);
    });

    it('returns an empty array when no upgrades exist', async () => {
      nock(BASE_URL).get('/v1/account-upgrade/0xabc').reply(200, []);
      const { service } = createService();

      const result = await service.getUpgrades('0xabc');

      expect(result).toStrictEqual([]);
    });

    it('throws on non-OK status', async () => {
      nock(BASE_URL)
        .get('/v1/account-upgrade/0xabc')
        .times(DEFAULT_MAX_RETRIES + 1)
        .reply(500);
      const { service } = createService();

      await expect(service.getUpgrades('0xabc')).rejects.toThrow(
        "Get upgrades request failed with status '500'",
      );
    });

    it('throws on malformed response', async () => {
      nock(BASE_URL)
        .get('/v1/account-upgrade/0xabc')
        .reply(200, JSON.stringify([{ bad: 'data' }]));
      const { service } = createService();

      await expect(service.getUpgrades('0xabc')).rejects.toThrow(
        'At path: 0.signerAddress -- Expected a string',
      );
    });
  });

  describe('verifyDelegation', () => {
    const delegationParams = {
      signedDelegation: {
        delegate: '0x1' as const,
        delegator: '0x2' as const,
        authority: '0x3' as const,
        caveats: [],
        salt: '0x4' as const,
        signature: '0x5' as const,
      },
      chainId: '0x1' as const,
    };

    it('sends a POST with auth headers and returns the response', async () => {
      nock(BASE_URL)
        .post('/v1/intent/verify-delegation', delegationParams)
        .matchHeader('Authorization', `Bearer ${MOCK_TOKEN}`)
        .reply(200, { valid: true, delegationHash: '0xabc123' });
      const { rootMessenger } = createService();

      const result = await rootMessenger.call(
        'ChompApiService:verifyDelegation',
        delegationParams,
      );

      expect(result).toStrictEqual({
        valid: true,
        delegationHash: '0xabc123',
      });
    });

    it('returns errors when delegation is invalid', async () => {
      nock(BASE_URL)
        .post('/v1/intent/verify-delegation')
        .reply(200, { valid: false, errors: ['bad signature'] });
      const { service } = createService();

      const result = await service.verifyDelegation(delegationParams);

      expect(result).toStrictEqual({
        valid: false,
        errors: ['bad signature'],
      });
    });

    it('throws on non-OK status', async () => {
      nock(BASE_URL)
        .post('/v1/intent/verify-delegation')
        .times(DEFAULT_MAX_RETRIES + 1)
        .reply(400);
      const { service } = createService();

      await expect(service.verifyDelegation(delegationParams)).rejects.toThrow(
        "POST /v1/intent/verify-delegation failed with status '400'",
      );
    });

    it('throws on malformed response', async () => {
      nock(BASE_URL)
        .post('/v1/intent/verify-delegation')
        .reply(200, JSON.stringify({ bad: 'data' }));
      const { service } = createService();

      await expect(service.verifyDelegation(delegationParams)).rejects.toThrow(
        'At path: valid -- Expected a value of type `boolean`',
      );
    });
  });

  describe('createIntents', () => {
    const intentParams = [
      {
        account: '0xabc' as const,
        delegationHash: '0xdef' as const,
        chainId: '0x1' as const,
        metadata: {
          allowance: '0xff' as const,
          tokenSymbol: 'USDC',
          tokenAddress: '0x123' as const,
          type: 'cash-deposit' as const,
        },
      },
    ];

    const intentResponse = [
      {
        delegationHash: '0xdef',
        metadata: {
          allowance: '0xff',
          tokenSymbol: 'USDC',
          tokenAddress: '0x123',
          type: 'cash-deposit',
        },
        createdAt: '2026-01-01T00:00:00Z',
      },
    ];

    it('sends a POST with auth headers and returns the response array', async () => {
      nock(BASE_URL)
        .post('/v1/intent', intentParams)
        .matchHeader('Authorization', `Bearer ${MOCK_TOKEN}`)
        .reply(201, intentResponse);
      const { rootMessenger } = createService();

      const result = await rootMessenger.call(
        'ChompApiService:createIntents',
        intentParams,
      );

      expect(result).toStrictEqual(intentResponse);
    });

    it('throws on non-OK status', async () => {
      nock(BASE_URL)
        .post('/v1/intent')
        .times(DEFAULT_MAX_RETRIES + 1)
        .reply(409);
      const { service } = createService();

      await expect(service.createIntents(intentParams)).rejects.toThrow(
        "POST /v1/intent failed with status '409'",
      );
    });

    it('throws on malformed response', async () => {
      nock(BASE_URL)
        .post('/v1/intent')
        .reply(201, JSON.stringify([{ bad: 'data' }]));
      const { service } = createService();

      await expect(service.createIntents(intentParams)).rejects.toThrow(
        'At path: 0.delegationHash -- Expected a string',
      );
    });
  });

  describe('getIntentsByAddress', () => {
    const intentsResponse = [
      {
        account: '0xabc',
        delegationHash: '0xdef',
        chainId: '0x1',
        status: 'active',
        metadata: {
          allowance: '0xff',
          tokenAddress: '0x123',
          tokenSymbol: 'USDC',
          type: 'cash-deposit',
        },
      },
    ];

    it('sends a GET with auth headers and returns the intents array', async () => {
      nock(BASE_URL)
        .get('/v1/intent/account/0xabc')
        .matchHeader('Authorization', `Bearer ${MOCK_TOKEN}`)
        .reply(200, intentsResponse);
      const { rootMessenger } = createService();

      const result = await rootMessenger.call(
        'ChompApiService:getIntentsByAddress',
        '0xabc',
      );

      expect(result).toStrictEqual(intentsResponse);
    });

    it('returns an empty array when no intents exist', async () => {
      nock(BASE_URL).get('/v1/intent/account/0xabc').reply(200, []);
      const { service } = createService();

      const result = await service.getIntentsByAddress('0xabc');

      expect(result).toStrictEqual([]);
    });

    it('throws on non-OK status', async () => {
      nock(BASE_URL)
        .get('/v1/intent/account/0xabc')
        .times(DEFAULT_MAX_RETRIES + 1)
        .reply(500);
      const { service } = createService();

      await expect(service.getIntentsByAddress('0xabc')).rejects.toThrow(
        "Get intents request failed with status '500'",
      );
    });

    it('throws on malformed response', async () => {
      nock(BASE_URL)
        .get('/v1/intent/account/0xabc')
        .reply(200, JSON.stringify([{ bad: 'data' }]));
      const { service } = createService();

      await expect(service.getIntentsByAddress('0xabc')).rejects.toThrow(
        'At path: 0.account -- Expected a string, but received: undefined',
      );
    });
  });

  describe('createWithdrawal', () => {
    const withdrawalParams = {
      chainId: '0x1' as const,
      amount: '1000000',
      account: '0xabc' as const,
    };

    it('sends a POST with auth headers and returns the response', async () => {
      nock(BASE_URL)
        .post('/v1/withdrawal', withdrawalParams)
        .matchHeader('Authorization', `Bearer ${MOCK_TOKEN}`)
        .reply(200, { success: true });
      const { rootMessenger } = createService();

      const result = await rootMessenger.call(
        'ChompApiService:createWithdrawal',
        withdrawalParams,
      );

      expect(result).toStrictEqual({ success: true });
    });

    it('throws on non-OK status', async () => {
      nock(BASE_URL)
        .post('/v1/withdrawal')
        .times(DEFAULT_MAX_RETRIES + 1)
        .reply(400);
      const { service } = createService();

      await expect(service.createWithdrawal(withdrawalParams)).rejects.toThrow(
        "POST /v1/withdrawal failed with status '400'",
      );
    });

    it('throws on malformed response', async () => {
      nock(BASE_URL)
        .post('/v1/withdrawal')
        .reply(200, JSON.stringify({ success: false }));
      const { service } = createService();

      await expect(service.createWithdrawal(withdrawalParams)).rejects.toThrow(
        'At path: success -- Expected the literal `true`',
      );
    });
  });

  describe('getServiceDetails', () => {
    const serviceDetailsResponse = {
      auth: {
        message: 'CHOMP Authentication ',
      },
      chains: {
        '0xa4b1': {
          autoDepositDelegate: '0xb4827a2a066cd2ef88560efdf063dd05c6c41cc7',
          protocol: {
            vedaProtocol: {
              supportedTokens: [
                {
                  tokenAddress: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
                  tokenDecimals: 6,
                },
              ],
              adapterAddress: '0x4839b1BA117BdFFA986FCfA4E5fE6b9027b8f8B1',
              intentTypes: ['cash-deposit', 'cash-withdrawal'],
            },
          },
        },
      },
    };

    it('sends a GET with auth headers and chainId query param and returns the response', async () => {
      nock(BASE_URL)
        .get('/v1/chomp')
        .query({ chainId: '0xa4b1' })
        .matchHeader('Authorization', `Bearer ${MOCK_TOKEN}`)
        .reply(200, serviceDetailsResponse);
      const { rootMessenger } = createService();

      const result = await rootMessenger.call(
        'ChompApiService:getServiceDetails',
        ['0xa4b1'],
      );

      expect(result).toStrictEqual(serviceDetailsResponse);
    });

    it('supports multiple chain IDs as a comma-separated query param', async () => {
      nock(BASE_URL)
        .get('/v1/chomp')
        .query({ chainId: '0xa4b1,0x1' })
        .matchHeader('Authorization', `Bearer ${MOCK_TOKEN}`)
        .reply(200, serviceDetailsResponse);
      const { service } = createService();

      const result = await service.getServiceDetails(['0xa4b1', '0x1']);

      expect(result).toStrictEqual(serviceDetailsResponse);
    });

    it('throws on non-OK status', async () => {
      nock(BASE_URL)
        .get('/v1/chomp')
        .query({ chainId: '0xa4b1' })
        .times(DEFAULT_MAX_RETRIES + 1)
        .reply(400);
      const { service } = createService();

      await expect(service.getServiceDetails(['0xa4b1'])).rejects.toThrow(
        "GET /v1/chomp failed with status '400'",
      );
    });

    it('throws on malformed response', async () => {
      nock(BASE_URL)
        .get('/v1/chomp')
        .query({ chainId: '0xa4b1' })
        .reply(200, JSON.stringify({ bad: 'data' }));
      const { service } = createService();

      await expect(service.getServiceDetails(['0xa4b1'])).rejects.toThrow(
        'At path: auth -- Expected an object',
      );
    });
  });
});

/**
 * The type of the messenger populated with all external actions and events
 * required by the service under test.
 */
type RootMessenger = Messenger<
  MockAnyNamespace,
  MessengerActions<ChompApiServiceMessenger>,
  MessengerEvents<ChompApiServiceMessenger>
>;

/**
 * Constructs the messenger populated with all external actions and events
 * required by the service under test.
 *
 * @returns The root messenger.
 */
function createRootMessenger(): RootMessenger {
  return new Messenger({ namespace: MOCK_ANY_NAMESPACE });
}

/**
 * Constructs the messenger for the service under test.
 *
 * @param rootMessenger - The root messenger, with all external actions and
 * events required by the controller's messenger.
 * @returns The service-specific messenger.
 */
function createServiceMessenger(
  rootMessenger: RootMessenger,
): ChompApiServiceMessenger {
  return new Messenger({
    namespace: 'ChompApiService',
    parent: rootMessenger,
  });
}

/**
 * Constructs the service under test.
 *
 * @param args - The arguments to this function.
 * @param args.options - The options that the service constructor takes. All are
 * optional and will be filled in with defaults as needed (including
 * `messenger`).
 * @returns The new service, root messenger, and service messenger.
 */
function createService({
  options = {},
}: {
  options?: Partial<ConstructorParameters<typeof ChompApiService>[0]>;
} = {}): {
  service: ChompApiService;
  rootMessenger: RootMessenger;
  messenger: ChompApiServiceMessenger;
} {
  const rootMessenger = createRootMessenger();
  rootMessenger.registerActionHandler(
    'AuthenticationController:getBearerToken',
    async () => MOCK_TOKEN,
  );
  const messenger = createServiceMessenger(rootMessenger);
  rootMessenger.delegate({
    messenger,
    actions: ['AuthenticationController:getBearerToken'],
    events: [],
  });
  const service = new ChompApiService({
    baseUrl: BASE_URL,
    messenger,
    ...options,
  });

  return { service, rootMessenger, messenger };
}
