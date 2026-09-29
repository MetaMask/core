import { Messenger, MOCK_ANY_NAMESPACE } from '@metamask/messenger';
import type {
  MockAnyNamespace,
  MessengerActions,
  MessengerEvents,
} from '@metamask/messenger';

import {
  ProfileService,
  ProfileServiceErrorMessage,
  serviceName,
} from './ProfileService.js';
import type {
  ConnectXParams,
  CreateProfileParams,
  ProfileServiceMessenger,
  ReplaceProfileParams,
  UpdateProfileParams,
} from './ProfileService.js';

const BASE_URL = 'https://profile.api.cx.metamask.io';
const V1_URL = `${BASE_URL}/v1`;
const MOCK_TOKEN = 'mock-bearer-token';

const mockProfileResponse = {
  profile_id: 'profile-123',
  username: 'alice',
  display_name: 'Alice Wonderland',
  bio: 'MetaMask user',
  linked_addresses: ['eip155:1:0x1234567890abcdef1234567890abcdef12345678'],
  avatar_url: 'https://example.com/avatar.png',
  trading_privacy: 'public' as const,
  connected_to_x: false,
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-02T00:00:00Z',
};

const mockXConnectResponse = {
  x_user_id: 'x-user-123',
  x_profile_url: 'https://x.com/degengirl',
  username: 'degengirl',
  display_name: 'Degen Girl',
  avatar_url: 'https://pbs.twimg.com/profile_images/degengirl.jpg',
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-02T00:00:00Z',
};

const mockAvailabilityResponse = {
  username: 'alice',
  available: true,
  valid: true,
  normalized: 'alice',
  errors: [],
};

type RootMessenger = Messenger<
  MockAnyNamespace,
  MessengerActions<ProfileServiceMessenger>,
  MessengerEvents<ProfileServiceMessenger>
>;

function getRootMessenger(): RootMessenger {
  return new Messenger({ namespace: MOCK_ANY_NAMESPACE });
}

function createMessenger(
  rootMessenger?: RootMessenger,
): ProfileServiceMessenger {
  const root = rootMessenger ?? getRootMessenger();

  root.registerActionHandler(
    'AuthenticationController:getBearerToken',
    async () => MOCK_TOKEN,
  );

  const serviceMessenger: ProfileServiceMessenger = new Messenger({
    namespace: serviceName,
    parent: root,
  });

  root.delegate({
    messenger: serviceMessenger,
    actions: ['AuthenticationController:getBearerToken'],
  });

  return serviceMessenger;
}

function createService(
  options: { messenger?: ProfileServiceMessenger } = {},
): ProfileService {
  const messenger = options.messenger ?? createMessenger();
  return new ProfileService({ messenger, baseUrl: BASE_URL });
}

describe('ProfileService', () => {
  const mockFetch = jest.fn();
  const originalFetch = global.fetch;

  beforeEach(() => {
    global.fetch = mockFetch;
    mockFetch.mockReset();
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  describe('getProfile', () => {
    it('fetches profile from correct endpoint', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve(mockProfileResponse),
      });

      const service = createService();
      const result = await service.getProfile('profile-123');

      expect(result).toStrictEqual(mockProfileResponse);
      expect(mockFetch).toHaveBeenCalledWith(`${V1_URL}/profiles/profile-123`, {
        headers: { Authorization: `Bearer ${MOCK_TOKEN}` },
      });
    });

    it('encodes the identifier in the URL', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve(mockProfileResponse),
      });

      const service = createService();
      await service.getProfile('user/with/slashes');

      expect(mockFetch).toHaveBeenCalledWith(
        `${V1_URL}/profiles/user%2Fwith%2Fslashes`,
        expect.anything(),
      );
    });

    it('throws HttpError on non-ok response', async () => {
      mockFetch.mockResolvedValue({ ok: false, status: 404 });

      const service = createService();

      await expect(service.getProfile('profile-123')).rejects.toThrow(
        `${ProfileServiceErrorMessage.GET_PROFILE_FAILED}: 404`,
      );
    });

    it('throws when response schema is invalid', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ invalid: 'shape' }),
      });

      const service = createService();

      await expect(service.getProfile('profile-123')).rejects.toThrow(
        'returned an unexpected response',
      );
    });
  });

  describe('createProfile', () => {
    const input: CreateProfileParams = {
      profile_id: 'canonical-123',
      username: 'alice',
      display_name: 'Alice Wonderland',
      linked_addresses: ['eip155:1:0x1234567890abcdef1234567890abcdef12345678'],
      trading_privacy: 'public',
    };

    it('posts to the profiles endpoint with correct body', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 201,
        json: () => Promise.resolve(mockProfileResponse),
      });

      const service = createService();
      const result = await service.createProfile(input);

      expect(result).toStrictEqual(mockProfileResponse);
      expect(mockFetch).toHaveBeenCalledWith(`${V1_URL}/profiles`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${MOCK_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(input),
      });
    });

    it('throws HttpError on non-ok response', async () => {
      mockFetch.mockResolvedValue({ ok: false, status: 400 });

      const service = createService();

      await expect(service.createProfile(input)).rejects.toThrow(
        `${ProfileServiceErrorMessage.CREATE_PROFILE_FAILED}: 400`,
      );
    });

    it('throws when response schema is invalid', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 201,
        json: () => Promise.resolve({ invalid: 'shape' }),
      });

      const service = createService();

      await expect(service.createProfile(input)).rejects.toThrow(
        'returned an unexpected response',
      );
    });
  });

  describe('replaceProfile', () => {
    const input: ReplaceProfileParams = {
      username: 'alice2',
      display_name: 'Alice 2',
      linked_addresses: ['eip155:1:0x1234567890abcdef1234567890abcdef12345678'],
      trading_privacy: 'public',
    };

    it('puts to the profile endpoint with correct body', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve(mockProfileResponse),
      });

      const service = createService();
      const result = await service.replaceProfile('profile-123', input);

      expect(result).toStrictEqual(mockProfileResponse);
      expect(mockFetch).toHaveBeenCalledWith(`${V1_URL}/profiles/profile-123`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${MOCK_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(input),
      });
    });

    it('throws HttpError on non-ok response', async () => {
      mockFetch.mockResolvedValue({ ok: false, status: 409 });

      const service = createService();

      await expect(
        service.replaceProfile('profile-123', input),
      ).rejects.toThrow(
        `${ProfileServiceErrorMessage.REPLACE_PROFILE_FAILED}: 409`,
      );
    });

    it('throws when response schema is invalid', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ invalid: 'shape' }),
      });

      const service = createService();

      await expect(
        service.replaceProfile('profile-123', input),
      ).rejects.toThrow('returned an unexpected response');
    });
  });

  describe('updateProfile', () => {
    const input: UpdateProfileParams = {
      username: 'alice2',
      display_name: 'Alice 2',
    };

    it('patches the profile endpoint with correct body', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve(mockProfileResponse),
      });

      const service = createService();
      const result = await service.updateProfile('profile-123', input);

      expect(result).toStrictEqual(mockProfileResponse);
      expect(mockFetch).toHaveBeenCalledWith(`${V1_URL}/profiles/profile-123`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${MOCK_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(input),
      });
    });

    it('throws HttpError on non-ok response', async () => {
      mockFetch.mockResolvedValue({ ok: false, status: 422 });

      const service = createService();

      await expect(service.updateProfile('profile-123', input)).rejects.toThrow(
        `${ProfileServiceErrorMessage.UPDATE_PROFILE_FAILED}: 422`,
      );
    });

    it('throws when response schema is invalid', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ invalid: 'shape' }),
      });

      const service = createService();

      await expect(service.updateProfile('profile-123', input)).rejects.toThrow(
        'returned an unexpected response',
      );
    });
  });

  describe('deleteProfile', () => {
    it('sends DELETE to the profile endpoint', async () => {
      mockFetch.mockResolvedValue({ ok: true, status: 204, json: () => null });

      const service = createService();
      await service.deleteProfile('profile-123');

      expect(mockFetch).toHaveBeenCalledWith(`${V1_URL}/profiles/profile-123`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${MOCK_TOKEN}` },
      });
    });

    it('throws HttpError on non-ok response', async () => {
      mockFetch.mockResolvedValue({ ok: false, status: 403 });

      const service = createService();

      await expect(service.deleteProfile('profile-123')).rejects.toThrow(
        `${ProfileServiceErrorMessage.DELETE_PROFILE_FAILED}: 403`,
      );
    });
  });

  describe('checkUsernameAvailability', () => {
    it('fetches username availability from correct endpoint', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve(mockAvailabilityResponse),
      });

      const service = createService();
      const result = await service.checkUsernameAvailability('alice');

      expect(result).toStrictEqual(mockAvailabilityResponse);
      expect(mockFetch).toHaveBeenCalledWith(
        `${V1_URL}/profiles/username/availability?username=alice`,
        { headers: { Authorization: `Bearer ${MOCK_TOKEN}` } },
      );
    });

    it('encodes the username in the URL', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve(mockAvailabilityResponse),
      });

      const service = createService();
      await service.checkUsernameAvailability('alice smith');

      expect(mockFetch).toHaveBeenCalledWith(
        `${V1_URL}/profiles/username/availability?username=alice%20smith`,
        expect.anything(),
      );
    });

    it('throws HttpError on non-ok response', async () => {
      mockFetch.mockResolvedValue({ ok: false, status: 500 });

      const service = createService();

      await expect(service.checkUsernameAvailability('alice')).rejects.toThrow(
        `${ProfileServiceErrorMessage.CHECK_USERNAME_AVAILABILITY_FAILED}: 500`,
      );
    });

    it('throws when response schema is invalid', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ invalid: 'shape' }),
      });

      const service = createService();

      await expect(service.checkUsernameAvailability('alice')).rejects.toThrow(
        'returned an unexpected response',
      );
    });
  });

  describe('getXAuthUrl', () => {
    const mockAuthUrlResponse = {
      url: 'https://twitter.com/i/oauth2/authorize?client_id=abc&state=xyz',
      state: 'xyz',
    };

    it('fetches X authentication URL from correct endpoint', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve(mockAuthUrlResponse),
      });

      const service = createService();
      const result = await service.getXAuthUrl();

      expect(result).toStrictEqual(mockAuthUrlResponse);
      expect(mockFetch).toHaveBeenCalledWith(
        `${V1_URL}/profiles/x/authentication-url`,
        { headers: { Authorization: `Bearer ${MOCK_TOKEN}` } },
      );
    });

    it('throws HttpError on non-ok response', async () => {
      mockFetch.mockResolvedValue({ ok: false, status: 500 });

      const service = createService();

      await expect(service.getXAuthUrl()).rejects.toThrow(
        `${ProfileServiceErrorMessage.GET_X_AUTH_URL_FAILED}: 500`,
      );
    });

    it('throws when response schema is invalid', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ invalid: 'shape' }),
      });

      const service = createService();

      await expect(service.getXAuthUrl()).rejects.toThrow(
        'returned an unexpected response',
      );
    });
  });

  describe('connectX', () => {
    it('posts code and state to the X connect endpoint', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve(mockXConnectResponse),
      });

      const params: ConnectXParams = {
        code: 'auth-code-123',
        state: 'state-xyz',
      };
      const service = createService();
      const result = await service.connectX(params);

      expect(result).toStrictEqual(mockXConnectResponse);
      expect(mockFetch).toHaveBeenCalledWith(`${V1_URL}/profiles/x/connect`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${MOCK_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(params),
      });
    });

    it('throws HttpError on non-ok response', async () => {
      mockFetch.mockResolvedValue({ ok: false, status: 401 });

      const service = createService();

      await expect(
        service.connectX({ code: 'auth-code-123', state: 'state-xyz' }),
      ).rejects.toThrow(`${ProfileServiceErrorMessage.CONNECT_X_FAILED}: 401`);
    });

    it('throws when response schema is invalid', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ invalid: 'shape' }),
      });

      const service = createService();

      await expect(
        service.connectX({ code: 'auth-code-123', state: 'state-xyz' }),
      ).rejects.toThrow('returned an unexpected response');
    });
  });

  describe('getXAccount', () => {
    it('fetches X account from correct endpoint', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve(mockXConnectResponse),
      });

      const service = createService();
      const result = await service.getXAccount();

      expect(result).toStrictEqual(mockXConnectResponse);
      expect(mockFetch).toHaveBeenCalledWith(`${V1_URL}/profiles/x/account`, {
        headers: { Authorization: `Bearer ${MOCK_TOKEN}` },
      });
    });

    it('throws HttpError on non-ok response', async () => {
      mockFetch.mockResolvedValue({ ok: false, status: 404 });

      const service = createService();

      await expect(service.getXAccount()).rejects.toThrow(
        `${ProfileServiceErrorMessage.GET_X_ACCOUNT_FAILED}: 404`,
      );
    });

    it('throws when response schema is invalid', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ invalid: 'shape' }),
      });

      const service = createService();

      await expect(service.getXAccount()).rejects.toThrow(
        'returned an unexpected response',
      );
    });
  });
});
