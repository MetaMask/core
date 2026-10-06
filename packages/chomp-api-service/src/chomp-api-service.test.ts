import { DEFAULT_MAX_RETRIES, handleAll } from '@metamask/controller-utils';
import { Messenger, MOCK_ANY_NAMESPACE } from '@metamask/messenger';
import type {
  MockAnyNamespace,
  MessengerActions,
  MessengerEvents,
} from '@metamask/messenger';
import nock from 'nock';

import type { ChompApiServiceMessenger } from './chomp-api-service.js';
import { ChompApiError, ChompApiService } from './chomp-api-service.js';

const BASE_URL = 'https://api.chomp.example.com';
const MOCK_TOKEN = 'mock-jwt-token';

describe('ChompApiService', () => {
  describe('createAddressChallenge', () => {
    const challengeResponse = {
      challengeId: '7b1e6f0c-1f3a-4d2b-9c8e-2a4b6c8d0e1f',
      message: 'api.chomp.example.com wants you to sign in...',
      expiresAt: '2026-10-06T12:05:00.000Z',
    };

    it('sends a POST with auth headers and returns the challenge', async () => {
      const params = { address: '0xabc', purpose: 'ASSOCIATE' } as const;
      nock(BASE_URL)
        .post('/v2/auth/address/challenge', params)
        .matchHeader('Authorization', `Bearer ${MOCK_TOKEN}`)
        .matchHeader('Content-Type', 'application/json')
        .reply(200, challengeResponse);
      const { rootMessenger } = createService();

      const result = await rootMessenger.call(
        'ChompApiService:createAddressChallenge',
        params,
      );

      expect(result).toStrictEqual(challengeResponse);
    });

    it('sends the predecessor address for a successor challenge', async () => {
      const params = {
        address: '0xabc',
        purpose: 'ASSOCIATE_SUCCESSOR',
        predecessorAddress: '0xdef',
      } as const;
      nock(BASE_URL)
        .post('/v2/auth/address/challenge', params)
        .reply(200, challengeResponse);
      const { service } = createService();

      const result = await service.createAddressChallenge(params);

      expect(result).toStrictEqual(challengeResponse);
    });

    it('requests a new challenge on every call', async () => {
      const params = { address: '0xabc', purpose: 'ASSOCIATE' } as const;
      const secondChallenge = {
        ...challengeResponse,
        challengeId: '0d9c8b7a-6f5e-4d3c-2b1a-0f9e8d7c6b5a',
      };
      nock(BASE_URL)
        .post('/v2/auth/address/challenge', params)
        .reply(200, challengeResponse)
        .post('/v2/auth/address/challenge', params)
        .reply(200, secondChallenge);
      const { service } = createService();

      const first = await service.createAddressChallenge(params);
      const second = await service.createAddressChallenge(params);

      expect(first).toStrictEqual(challengeResponse);
      expect(second).toStrictEqual(secondChallenge);
    });

    it('throws a ChompApiError on non-OK status', async () => {
      nock(BASE_URL)
        .post('/v2/auth/address/challenge')
        .reply(404, { statusCode: 404, message: 'Feature not found' });
      const { service } = createService();

      const error = await service
        .createAddressChallenge({
          address: '0xabc',
          purpose: 'ASSOCIATE_SUCCESSOR',
          predecessorAddress: '0xdef',
        })
        .catch((caught: unknown) => caught);

      expect(error).toBeInstanceOf(ChompApiError);
      expect(error).toMatchObject({
        httpStatus: 404,
        message: "POST /v2/auth/address/challenge failed with status '404'",
      });
    });

    it('throws on malformed response', async () => {
      nock(BASE_URL)
        .post('/v2/auth/address/challenge')
        .reply(200, { challengeId: 'id', expiresAt: 'later' });
      const { service } = createService();

      await expect(
        service.createAddressChallenge({
          address: '0xabc',
          purpose: 'ASSOCIATE',
        }),
      ).rejects.toThrow('At path: message');
    });
  });

  describe('associateAddressV2', () => {
    const associateParams = {
      challengeId: '7b1e6f0c-1f3a-4d2b-9c8e-2a4b6c8d0e1f',
      signature: '0x123' as const,
    };

    it('sends a POST with auth headers and returns the response on 201', async () => {
      nock(BASE_URL)
        .post('/v2/auth/address', associateParams)
        .matchHeader('Authorization', `Bearer ${MOCK_TOKEN}`)
        .matchHeader('Content-Type', 'application/json')
        .reply(201, {
          profileId: 'p1',
          address: '0xabc',
          status: 'created',
        });
      const { rootMessenger } = createService();

      const result = await rootMessenger.call(
        'ChompApiService:associateAddressV2',
        associateParams,
      );

      expect(result).toStrictEqual({
        profileId: 'p1',
        address: '0xabc',
        status: 'created',
      });
    });

    it('returns the response when the address is already associated with the profile', async () => {
      nock(BASE_URL).post('/v2/auth/address').reply(200, {
        address: '0xabc',
        status: 'active',
      });
      const { service } = createService();

      const result = await service.associateAddressV2(associateParams);

      expect(result).toStrictEqual({
        address: '0xabc',
        status: 'active',
      });
    });

    it('throws a ChompApiError carrying the CHOMP error code', async () => {
      nock(BASE_URL).post('/v2/auth/address').reply(400, {
        statusCode: 400,
        code: 'CHALLENGE_INVALID_OR_EXPIRED',
        message: 'Challenge is invalid or expired',
      });
      const { service } = createService();

      const error = await service
        .associateAddressV2(associateParams)
        .catch((caught: unknown) => caught);

      expect(error).toBeInstanceOf(ChompApiError);
      expect(error).toMatchObject({
        httpStatus: 400,
        code: 'CHALLENGE_INVALID_OR_EXPIRED',
        message: "POST /v2/auth/address failed with status '400'",
      });
    });

    it('throws on malformed response', async () => {
      nock(BASE_URL).post('/v2/auth/address').reply(201, { missing: 'fields' });
      const { service } = createService();

      await expect(service.associateAddressV2(associateParams)).rejects.toThrow(
        'At path: address',
      );
    });
  });

  describe('disassociateAddress', () => {
    it('sends a DELETE with auth headers and the address', async () => {
      const scope = nock(BASE_URL)
        .delete('/v1/auth/address', { address: '0xabc' })
        .matchHeader('Authorization', `Bearer ${MOCK_TOKEN}`)
        .matchHeader('Content-Type', 'application/json')
        .reply(204);
      const { rootMessenger } = createService();

      await rootMessenger.call('ChompApiService:disassociateAddress', '0xabc');

      expect(scope.isDone()).toBe(true);
    });

    it('throws a ChompApiError carrying the CHOMP error code', async () => {
      nock(BASE_URL)
        .delete('/v1/auth/address')
        .reply(409, { code: 'MIGRATION_DONE' });
      const { service } = createService();

      await expect(service.disassociateAddress('0xabc')).rejects.toMatchObject({
        httpStatus: 409,
        code: 'MIGRATION_DONE',
        message: "DELETE /v1/auth/address failed with status '409'",
      });
    });
  });

  describe('getAssociatedAddresses', () => {
    const addressEntry = {
      profileId: 'p1',
      address: '0xabc',
      status: 'active',
    };

    it('sends a GET with auth headers and returns the address entries', async () => {
      nock(BASE_URL)
        .get('/v1/auth/address')
        .matchHeader('Authorization', `Bearer ${MOCK_TOKEN}`)
        .reply(200, [addressEntry]);
      const { rootMessenger } = createService();

      const result = await rootMessenger.call(
        'ChompApiService:getAssociatedAddresses',
      );

      expect(result).toStrictEqual([addressEntry]);
    });

    it('returns an empty array when no addresses are associated', async () => {
      nock(BASE_URL).get('/v1/auth/address').reply(200, []);
      const { service } = createService();

      const result = await service.getAssociatedAddresses();

      expect(result).toStrictEqual([]);
    });

    it('lowercases returned addresses', async () => {
      nock(BASE_URL)
        .get('/v1/auth/address')
        .reply(200, [
          {
            profileId: 'p1',
            address: '0xABCdef1234567890ABCdef1234567890ABCdef12',
            status: 'active',
          },
        ]);
      const { service } = createService();

      const result = await service.getAssociatedAddresses();

      expect(result).toStrictEqual([
        {
          profileId: 'p1',
          address: '0xabcdef1234567890abcdef1234567890abcdef12',
          status: 'active',
        },
      ]);
    });

    it('rejects entries with a non-active status', async () => {
      nock(BASE_URL)
        .get('/v1/auth/address')
        .reply(200, [{ profileId: 'p1', address: '0xabc', status: 'deleted' }]);
      const { service } = createService();

      await expect(service.getAssociatedAddresses()).rejects.toThrow(
        'At path: 0.status',
      );
    });

    it('does not serve results from cache', async () => {
      nock(BASE_URL).get('/v1/auth/address').reply(200, []);
      nock(BASE_URL).get('/v1/auth/address').reply(200, [addressEntry]);
      const { service } = createService();

      const first = await service.getAssociatedAddresses();
      const second = await service.getAssociatedAddresses();

      expect(first).toStrictEqual([]);
      expect(second).toStrictEqual([addressEntry]);
    });

    it('does not share an in-flight request across different bearer tokens', async () => {
      const tokens = ['profile-a-token', 'profile-b-token'];
      const { service } = createService({
        getBearerToken: async () => tokens.shift() ?? 'exhausted',
      });
      // The first profile's request is still in flight when the second
      // profile's request is issued; the second must not be deduplicated
      // onto the first, or it would receive the first profile's addresses.
      nock(BASE_URL)
        .get('/v1/auth/address')
        .matchHeader('Authorization', 'Bearer profile-a-token')
        .delay(100)
        .reply(200, []);
      nock(BASE_URL)
        .get('/v1/auth/address')
        .matchHeader('Authorization', 'Bearer profile-b-token')
        .reply(200, [addressEntry]);

      const [first, second] = await Promise.all([
        service.getAssociatedAddresses(),
        service.getAssociatedAddresses(),
      ]);

      expect(first).toStrictEqual([]);
      expect(second).toStrictEqual([addressEntry]);
    });

    it('shares an in-flight request across calls with the same bearer token', async () => {
      // A single interceptor: both concurrent same-profile calls must be
      // served by one HTTP request.
      nock(BASE_URL)
        .get('/v1/auth/address')
        .delay(100)
        .reply(200, [addressEntry]);
      const { service } = createService();

      const [first, second] = await Promise.all([
        service.getAssociatedAddresses(),
        service.getAssociatedAddresses(),
      ]);

      expect(first).toStrictEqual([addressEntry]);
      expect(second).toStrictEqual([addressEntry]);
    });

    it('does not leak the bearer token through cache update events', async () => {
      nock(BASE_URL).get('/v1/auth/address').reply(200, [addressEntry]);
      const { service, messenger } = createService();
      const publishSpy = jest.spyOn(messenger, 'publish');

      await service.getAssociatedAddresses();

      expect(publishSpy).toHaveBeenCalled();
      expect(JSON.stringify(publishSpy.mock.calls)).not.toContain(MOCK_TOKEN);
    });

    it('evicts the result from the cache once the call settles', async () => {
      nock(BASE_URL).get('/v1/auth/address').reply(200, [addressEntry]);
      const { service, messenger } = createService();
      const publishSpy = jest.spyOn(messenger, 'publish');

      await service.getAssociatedAddresses();
      // Eviction (`cacheTime: 0`) is scheduled on a macrotask; let it run.
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(publishSpy).toHaveBeenCalledWith(
        'ChompApiService:cacheUpdated',
        expect.objectContaining({ type: 'removed' }),
      );
    });

    it('throws on non-OK status', async () => {
      nock(BASE_URL)
        .get('/v1/auth/address')
        .times(DEFAULT_MAX_RETRIES + 1)
        .reply(500);
      const { service } = createService();

      await expect(service.getAssociatedAddresses()).rejects.toThrow(
        "GET /v1/auth/address failed with status '500'",
      );
    });

    it('throws on malformed response', async () => {
      nock(BASE_URL)
        .get('/v1/auth/address')
        .reply(200, JSON.stringify([{ bad: 'data' }]));
      const { service } = createService();

      await expect(service.getAssociatedAddresses()).rejects.toThrow(
        'At path: 0.profileId',
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
      nock(BASE_URL).post('/v1/intent/verify-delegation').reply(400);
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
      nock(BASE_URL).post('/v1/intent').reply(409);
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

    for (const type of [
      'cash-deposit-premium',
      'cash-withdrawal-premium',
      'cash-subscription',
      'cash-migration-root',
      'cash-migration-transfer',
    ] as const) {
      it(`accepts and returns the "${type}" intent type`, async () => {
        const params = [
          {
            ...intentParams[0],
            metadata: { ...intentParams[0].metadata, type },
          },
        ];
        const response = [
          {
            ...intentResponse[0],
            metadata: { ...intentResponse[0].metadata, type },
          },
        ];
        nock(BASE_URL).post('/v1/intent', params).reply(201, response);
        const { service } = createService();

        expect(await service.createIntents(params)).toStrictEqual(response);
      });
    }
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

    it('does not serve results from cache', async () => {
      nock(BASE_URL).get('/v1/intent/account/0xabc').reply(200, []);
      nock(BASE_URL)
        .get('/v1/intent/account/0xabc')
        .reply(200, intentsResponse);
      const { service } = createService();

      const first = await service.getIntentsByAddress('0xabc');
      const second = await service.getIntentsByAddress('0xabc');

      expect(first).toStrictEqual([]);
      expect(second).toStrictEqual(intentsResponse);
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

    for (const type of [
      'cash-deposit-premium',
      'cash-withdrawal-premium',
      'cash-subscription',
      'cash-migration-root',
      'cash-migration-transfer',
    ] as const) {
      it(`accepts and returns the "${type}" intent type`, async () => {
        const response = [
          {
            ...intentsResponse[0],
            metadata: { ...intentsResponse[0].metadata, type },
          },
        ];
        nock(BASE_URL).get('/v1/intent/account/0xabc').reply(200, response);
        const { service } = createService();

        expect(await service.getIntentsByAddress('0xabc')).toStrictEqual(
          response,
        );
      });
    }

    it('omits intents with an unknown intent type', async () => {
      const unknownIntent = {
        ...intentsResponse[0],
        delegationHash: '0x456',
        metadata: { ...intentsResponse[0].metadata, type: 'some-future-type' },
      };
      nock(BASE_URL)
        .get('/v1/intent/account/0xabc')
        .reply(200, [unknownIntent, ...intentsResponse]);
      const { service } = createService();

      expect(await service.getIntentsByAddress('0xabc')).toStrictEqual(
        intentsResponse,
      );
    });

    it('throws when an intent type is not a string', async () => {
      nock(BASE_URL)
        .get('/v1/intent/account/0xabc')
        .reply(200, [
          {
            ...intentsResponse[0],
            metadata: { ...intentsResponse[0].metadata, type: 123 },
          },
        ]);
      const { service } = createService();

      await expect(service.getIntentsByAddress('0xabc')).rejects.toThrow(
        'At path: 0.metadata.type -- Expected a string, but received: 123',
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
      nock(BASE_URL).post('/v1/withdrawal').reply(400);
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

    it('accepts a separate premium Veda protocol', async () => {
      const response = {
        ...serviceDetailsResponse,
        chains: {
          '0xa4b1': {
            ...serviceDetailsResponse.chains['0xa4b1'],
            protocol: {
              ...serviceDetailsResponse.chains['0xa4b1'].protocol,
              vedaPremiumProtocol: {
                supportedTokens: [
                  {
                    tokenAddress: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
                    tokenDecimals: 6,
                  },
                  {
                    tokenAddress: '0xBFeC8c2b1ccea3931a1363E4CaC27352c1C908B7',
                    tokenDecimals: 6,
                  },
                ],
                adapterAddress: '0x9AF808DA682aC92AA23CF40509F5A3694445e2b7',
                intentTypes: [
                  'cash-deposit-premium',
                  'cash-withdrawal-premium',
                ],
              },
            },
          },
        },
      };
      nock(BASE_URL)
        .get('/v1/chomp')
        .query({ chainId: '0xa4b1' })
        .reply(200, response);
      const { service } = createService();

      expect(await service.getServiceDetails(['0xa4b1'])).toStrictEqual(
        response,
      );
    });

    it('omits unknown intent types from a protocol', async () => {
      const response = {
        ...serviceDetailsResponse,
        chains: {
          '0xa4b1': {
            ...serviceDetailsResponse.chains['0xa4b1'],
            protocol: {
              vedaProtocol: {
                ...serviceDetailsResponse.chains['0xa4b1'].protocol
                  .vedaProtocol,
                intentTypes: [
                  'cash-deposit',
                  'some-future-type',
                  'cash-withdrawal',
                ],
              },
            },
          },
        },
      };
      nock(BASE_URL)
        .get('/v1/chomp')
        .query({ chainId: '0xa4b1' })
        .reply(200, response);
      const { service } = createService();

      expect(await service.getServiceDetails(['0xa4b1'])).toStrictEqual(
        serviceDetailsResponse,
      );
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
      nock(BASE_URL).get('/v1/chomp').query({ chainId: '0xa4b1' }).reply(400);
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

  describe('retry policy', () => {
    const upgradeParams = {
      r: '0x1' as const,
      s: '0x2' as const,
      v: 27,
      yParity: 0,
      address: '0xabc' as const,
      chainId: '1',
      nonce: '0',
    };

    it('retries 5xx responses up to the default retry limit', async () => {
      let attempts = 0;
      nock(BASE_URL)
        .post('/v1/account-upgrade')
        .times(DEFAULT_MAX_RETRIES + 1)
        .reply(() => {
          attempts += 1;
          return [500];
        });
      const { service } = createService();

      await expect(service.createUpgrade(upgradeParams)).rejects.toThrow(
        "POST /v1/account-upgrade failed with status '500'",
      );
      expect(attempts).toBe(DEFAULT_MAX_RETRIES + 1);
    });

    it.each([400, 401, 403, 404, 409, 422])(
      'does not retry %i responses',
      async (status) => {
        let attempts = 0;
        nock(BASE_URL)
          .post('/v1/account-upgrade')
          .times(DEFAULT_MAX_RETRIES + 1)
          .reply(() => {
            attempts += 1;
            return [status];
          });
        const { service } = createService();

        await expect(service.createUpgrade(upgradeParams)).rejects.toThrow(
          `POST /v1/account-upgrade failed with status '${status}'`,
        );
        expect(attempts).toBe(1);
      },
    );

    it('retries 429 responses alongside 5xx (rate-limit is transient)', async () => {
      let attempts = 0;
      nock(BASE_URL)
        .post('/v1/account-upgrade')
        .times(DEFAULT_MAX_RETRIES + 1)
        .reply(() => {
          attempts += 1;
          return [429];
        });
      const { service } = createService();

      await expect(service.createUpgrade(upgradeParams)).rejects.toThrow(
        "POST /v1/account-upgrade failed with status '429'",
      );
      expect(attempts).toBe(DEFAULT_MAX_RETRIES + 1);
    });

    it('retries non-HTTP errors (e.g. network failures)', async () => {
      const scope = nock(BASE_URL)
        .post('/v1/account-upgrade')
        .times(DEFAULT_MAX_RETRIES + 1)
        .replyWithError('network down');
      const { service } = createService();

      await expect(service.createUpgrade(upgradeParams)).rejects.toThrow(
        'network down',
      );
      expect(scope.isDone()).toBe(true);
    });

    it('lets consumer-supplied policyOptions override the default retryFilterPolicy', async () => {
      let attempts = 0;
      nock(BASE_URL)
        .post('/v1/account-upgrade')
        .times(DEFAULT_MAX_RETRIES + 1)
        .reply(() => {
          attempts += 1;
          return [409];
        });
      const { service } = createService({
        options: { policyOptions: { retryFilterPolicy: handleAll } },
      });

      await expect(service.createUpgrade(upgradeParams)).rejects.toThrow(
        "POST /v1/account-upgrade failed with status '409'",
      );
      expect(attempts).toBe(DEFAULT_MAX_RETRIES + 1);
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
 * @param args.getBearerToken - The handler for the
 * `AuthenticationController:getBearerToken` action. Defaults to returning
 * `MOCK_TOKEN`.
 * @returns The new service, root messenger, and service messenger.
 */
function createService({
  options = {},
  getBearerToken = async (): Promise<string> => MOCK_TOKEN,
}: {
  options?: Partial<ConstructorParameters<typeof ChompApiService>[0]>;
  getBearerToken?: () => Promise<string>;
} = {}): {
  service: ChompApiService;
  rootMessenger: RootMessenger;
  messenger: ChompApiServiceMessenger;
} {
  const rootMessenger = createRootMessenger();
  rootMessenger.registerActionHandler(
    'AuthenticationController:getBearerToken',
    getBearerToken,
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
