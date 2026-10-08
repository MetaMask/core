import { Messenger, MOCK_ANY_NAMESPACE } from '@metamask/messenger';
import type {
  MockAnyNamespace,
  MessengerActions,
  MessengerEvents,
} from '@metamask/messenger';

import { serviceName } from './ProfileService.js';
import type { ProfileServiceMessenger } from './ProfileService.js';
import {
  buildMockProfileService,
  MOCK_PROFILE_API_RESPONSE,
  MOCK_X_AUTH_URL_RESPONSE,
  MOCK_X_CONNECT_RESPONSE,
} from './ProfileServiceMock.js';

type RootMessenger = Messenger<
  MockAnyNamespace,
  MessengerActions<ProfileServiceMessenger>,
  MessengerEvents<ProfileServiceMessenger>
>;

function getRootMessenger(): RootMessenger {
  return new Messenger({ namespace: MOCK_ANY_NAMESPACE });
}

function createMessenger(): ProfileServiceMessenger {
  const root = getRootMessenger();

  root.registerActionHandler(
    'AuthenticationController:getBearerToken',
    async () => 'mock-token',
  );

  const messenger: ProfileServiceMessenger = new Messenger({
    namespace: serviceName,
    parent: root,
  });

  root.delegate({
    messenger,
    actions: ['AuthenticationController:getBearerToken'],
  });

  return messenger;
}

describe('buildMockProfileService', () => {
  describe('default handlers', () => {
    it('registers getProfile returning MOCK_PROFILE_API_RESPONSE', async () => {
      const messenger = createMessenger();
      buildMockProfileService(messenger);

      const result = await messenger.call('ProfileService:getProfile', 'any-id');

      expect(result).toStrictEqual(MOCK_PROFILE_API_RESPONSE);
    });

    it('registers createProfile returning MOCK_PROFILE_API_RESPONSE', async () => {
      const messenger = createMessenger();
      buildMockProfileService(messenger);

      const result = await messenger.call('ProfileService:createProfile', {
        profile_id: 'p1',
        username: 'alice',
        display_name: 'Alice',
        linked_addresses: [],
        trading_privacy: 'public',
      });

      expect(result).toStrictEqual(MOCK_PROFILE_API_RESPONSE);
    });

    it('registers replaceProfile returning MOCK_PROFILE_API_RESPONSE', async () => {
      const messenger = createMessenger();
      buildMockProfileService(messenger);

      const result = await messenger.call(
        'ProfileService:replaceProfile',
        'p1',
        {
          username: 'alice',
          display_name: 'Alice',
          linked_addresses: [],
          trading_privacy: 'public',
        },
      );

      expect(result).toStrictEqual(MOCK_PROFILE_API_RESPONSE);
    });

    it('registers updateProfile returning MOCK_PROFILE_API_RESPONSE', async () => {
      const messenger = createMessenger();
      buildMockProfileService(messenger);

      const result = await messenger.call(
        'ProfileService:updateProfile',
        'p1',
        { display_name: 'Alice Updated' },
      );

      expect(result).toStrictEqual(MOCK_PROFILE_API_RESPONSE);
    });

    it('registers deleteProfile resolving without error', async () => {
      const messenger = createMessenger();
      buildMockProfileService(messenger);

      await expect(
        messenger.call('ProfileService:deleteProfile', 'p1'),
      ).resolves.toBeUndefined();
    });

    it('registers checkUsernameAvailability echoing the queried username', async () => {
      const messenger = createMessenger();
      buildMockProfileService(messenger);

      const result = await messenger.call(
        'ProfileService:checkUsernameAvailability',
        'alice',
      );

      expect(result).toStrictEqual({
        username: 'alice',
        available: true,
        valid: true,
        normalized: 'alice',
        errors: [],
      });
    });

    it('registers getXAuthUrl returning MOCK_X_AUTH_URL_RESPONSE', async () => {
      const messenger = createMessenger();
      buildMockProfileService(messenger);

      const result = await messenger.call('ProfileService:getXAuthUrl');

      expect(result).toStrictEqual(MOCK_X_AUTH_URL_RESPONSE);
    });

    it('registers connectX returning MOCK_X_CONNECT_RESPONSE', async () => {
      const messenger = createMessenger();
      buildMockProfileService(messenger);

      const result = await messenger.call('ProfileService:connectX', {
        code: 'mock-code',
        state: 'mock-state',
      });

      expect(result).toStrictEqual(MOCK_X_CONNECT_RESPONSE);
    });

    it('registers getXAccount returning MOCK_X_CONNECT_RESPONSE', async () => {
      const messenger = createMessenger();
      buildMockProfileService(messenger);

      const result = await messenger.call('ProfileService:getXAccount');

      expect(result).toStrictEqual(MOCK_X_CONNECT_RESPONSE);
    });
  });

  describe('handler overrides', () => {
    it('uses a custom getProfile handler when provided', async () => {
      const messenger = createMessenger();
      const customProfile = {
        ...MOCK_PROFILE_API_RESPONSE,
        username: 'custom',
      };
      buildMockProfileService(messenger, {
        getProfile: async () => customProfile,
      });

      const result = await messenger.call('ProfileService:getProfile', 'p1');

      expect(result).toStrictEqual(customProfile);
    });

    it('uses a custom checkUsernameAvailability handler when provided', async () => {
      const messenger = createMessenger();
      buildMockProfileService(messenger, {
        checkUsernameAvailability: async (username) => ({
          username,
          available: false,
          valid: true,
          normalized: username,
          errors: [{ code: 'taken', message: 'Username is already taken' }],
        }),
      });

      const result = await messenger.call(
        'ProfileService:checkUsernameAvailability',
        'taken',
      );

      expect(result.available).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].code).toBe('taken');
    });

    it('only overrides specified methods, leaving others as defaults', async () => {
      const messenger = createMessenger();
      buildMockProfileService(messenger, {
        getXAuthUrl: async () => ({
          url: 'https://x.com/custom',
          state: 'custom-state',
        }),
      });

      const authUrl = await messenger.call('ProfileService:getXAuthUrl');
      const profile = await messenger.call('ProfileService:getProfile', 'p1');

      expect(authUrl.url).toBe('https://x.com/custom');
      expect(profile).toStrictEqual(MOCK_PROFILE_API_RESPONSE);
    });
  });
});
