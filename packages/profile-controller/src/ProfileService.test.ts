import { HttpError } from '@metamask/controller-utils';
import { Messenger, MOCK_ANY_NAMESPACE } from '@metamask/messenger';
import type {
  MockAnyNamespace,
  MessengerActions,
  MessengerEvents,
} from '@metamask/messenger';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  ProfileService,
  ProfileServiceErrorMessage,
  serviceName,
} from './ProfileService.js';
import { ProfileServiceError } from './errors/index.js';
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

const mockConnectXResponse = {
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
  const mockFetch = vi.fn();

  beforeEach(() => {
    vi.stubGlobal('fetch', mockFetch);
    mockFetch.mockReset();
  });

  describe('getProfile', () => {
    it.each([true, false])(
      'accepts verified=%s in the API response',
      async (verified) => {
        mockFetch.mockResolvedValue({
          ok: true,
          status: 200,
          json: async () => ({ ...mockProfileResponse, verified }),
        });
        const result = await createService().getProfile('profile-123');
        expect(result).toStrictEqual({ ...mockProfileResponse, verified });
      },
    );

    it('rejects a non-boolean verified field', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ ...mockProfileResponse, verified: 'true' }),
      });
      await expect(createService().getProfile('profile-123')).rejects.toThrow(
        /verified/u,
      );
    });

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

    it('includes the API error message from the response body', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 404,
        json: () =>
          Promise.resolve({ code: 'not_found', message: 'Profile not found' }),
      });

      const service = createService();

      await expect(service.getProfile('profile-123')).rejects.toThrow(
        `${ProfileServiceErrorMessage.GET_PROFILE_FAILED}: 404: Profile not found`,
      );
    });

    it('includes the API error message when the response body has no code', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 404,
        json: () => Promise.resolve({ message: 'Profile not found' }),
      });

      const service = createService();

      await expect(service.getProfile('profile-123')).rejects.toThrow(
        `${ProfileServiceErrorMessage.GET_PROFILE_FAILED}: 404: Profile not found`,
      );
    });

    it('falls back to the generic message when the error body is not JSON', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        json: () => Promise.reject(new Error('invalid JSON')),
      });

      const service = createService();
      const error: unknown = await service
        .getProfile('profile-123')
        .catch((caughtError: unknown) => caughtError);

      expect(error).toBeInstanceOf(HttpError);
      expect((error as Error).message).toBe(
        `${ProfileServiceErrorMessage.GET_PROFILE_FAILED}: 500`,
      );
    });

    it('falls back to the generic message when the error body has no message', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 400,
        json: () => Promise.resolve({ code: 'bad_request' }),
      });

      const service = createService();
      const error: unknown = await service
        .getProfile('profile-123')
        .catch((caughtError: unknown) => caughtError);

      expect(error).toBeInstanceOf(HttpError);
      expect((error as Error).message).toBe(
        `${ProfileServiceErrorMessage.GET_PROFILE_FAILED}: 400`,
      );
      expect((error as ProfileServiceError).code).toBe('bad_request');
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

    it('serves repeated calls from the cache', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve(mockProfileResponse),
      });

      const service = createService();
      await service.getProfile('profile-123');
      const result = await service.getProfile('profile-123');

      expect(result).toStrictEqual(mockProfileResponse);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
  });

  describe('error envelope', () => {
    const errorResponse = (status: number, body: unknown) => ({
      ok: false,
      status,
      json: () => Promise.resolve(body),
    });

    it('attaches the API error code and metadata to the thrown error', async () => {
      mockFetch.mockResolvedValue(
        errorResponse(409, {
          statusCode: 409,
          error: 'Conflict',
          code: 'USERNAME_TAKEN',
          code_info: {
            id: 'USERNAME_TAKEN',
            http_status: 409,
            category: 'username',
            retryable: false,
          },
          message: 'Username "alice" is already taken.',
          requestId: 'req_01HX',
          retryable: false,
          details: [
            {
              field: 'username',
              code: 'TAKEN',
              message: 'Username "alice" is already taken.',
              meta: { source: 'checker' },
            },
          ],
        }),
      );

      const service = createService();
      const error = (await service
        .getProfile('profile-123')
        .catch((caught: unknown) => caught)) as ProfileServiceError;

      expect(error).toBeInstanceOf(ProfileServiceError);
      expect(error).toBeInstanceOf(HttpError);
      expect(error.httpStatus).toBe(409);
      expect(error.code).toBe('USERNAME_TAKEN');
      expect(error.code_info).toStrictEqual({
        id: 'USERNAME_TAKEN',
        http_status: 409,
        category: 'username',
        retryable: false,
      });
      expect(error.retryable).toBe(false);
      expect(error.requestId).toBe('req_01HX');
      expect(error.details).toStrictEqual([
        {
          field: 'username',
          code: 'TAKEN',
          message: 'Username "alice" is already taken.',
          meta: { source: 'checker' },
        },
      ]);
      expect(error.message).toBe(
        `${ProfileServiceErrorMessage.GET_PROFILE_FAILED}: 409: Username "alice" is already taken.`,
      );
    });

    it('joins validation messages and keeps the field details', async () => {
      mockFetch.mockResolvedValue(
        errorResponse(400, {
          code: 'VALIDATION_FAILED',
          code_info: {
            id: 'VALIDATION_FAILED',
            http_status: 400,
            category: 'validation',
            retryable: false,
          },
          message: [
            'display_name must be shorter than or equal to 32 characters',
            'bio must be a string',
          ],
          retryable: false,
          details: [
            {
              field: 'display_name',
              code: 'FIELD_TOO_LONG',
              message:
                'display_name must be shorter than or equal to 32 characters',
            },
            {
              field: 'bio',
              code: 'FIELD_INVALID_TYPE',
              message: 'bio must be a string',
            },
          ],
        }),
      );

      const service = createService();
      const error = (await service
        .getProfile('profile-123')
        .catch((caught: unknown) => caught)) as ProfileServiceError;

      expect(error.message).toBe(
        `${ProfileServiceErrorMessage.GET_PROFILE_FAILED}: 400: display_name must be shorter than or equal to 32 characters; bio must be a string`,
      );
      expect(error.details).toHaveLength(2);
      expect(error.details?.[1]).toStrictEqual({
        field: 'bio',
        code: 'FIELD_INVALID_TYPE',
        message: 'bio must be a string',
      });
    });

    it('keeps the envelope when a validation message is not a string', async () => {
      mockFetch.mockResolvedValue(
        errorResponse(400, {
          code: 'VALIDATION_FAILED',
          message: ['display_name is required', 42],
          details: [
            {
              field: 'display_name',
              code: 'FIELD_REQUIRED',
              message: 'display_name is required',
            },
          ],
        }),
      );

      const service = createService();
      const error = (await service
        .getProfile('profile-123')
        .catch((caught: unknown) => caught)) as ProfileServiceError;

      expect(error.code).toBe('VALIDATION_FAILED');
      expect(error.message).toContain('display_name is required; 42');
      expect(error.details).toHaveLength(1);
    });

    it('falls back to code_info.retryable when the top-level field is absent', async () => {
      mockFetch.mockResolvedValue(
        errorResponse(503, {
          code: 'SERVICE_UNAVAILABLE',
          code_info: {
            id: 'SERVICE_UNAVAILABLE',
            http_status: 503,
            category: 'upstream',
            retryable: true,
          },
          message: 'Service temporarily unavailable.',
        }),
      );

      const service = createService();
      const error = (await service
        .getProfile('profile-123')
        .catch((caught: unknown) => caught)) as ProfileServiceError;

      expect(error.retryable).toBe(true);
    });

    it('leaves the envelope fields undefined when the body is not an error envelope', async () => {
      mockFetch.mockResolvedValue(errorResponse(500, { unexpected: true }));

      const service = createService();
      const error = (await service
        .getProfile('profile-123')
        .catch((caught: unknown) => caught)) as ProfileServiceError;

      expect(error).toBeInstanceOf(ProfileServiceError);
      expect(error.code).toBeUndefined();
      expect(error.code_info).toBeUndefined();
      expect(error.details).toBeUndefined();
      expect(error.retryable).toBeUndefined();
      expect(error.requestId).toBeUndefined();
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
        `${V1_URL}/profiles/username/availability?username=alice+smith`,
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

  describe('checkDisplayNameValidity', () => {
    const mockValidityResponse = { valid: true };

    it('fetches display name validity from correct endpoint', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve(mockValidityResponse),
      });

      const service = createService();
      const result = await service.checkDisplayNameValidity('Alice Wonderland');

      expect(result).toStrictEqual(mockValidityResponse);
      expect(mockFetch).toHaveBeenCalledWith(
        `${V1_URL}/profiles/display-name/validity?display_name=Alice+Wonderland`,
        { headers: { Authorization: `Bearer ${MOCK_TOKEN}` } },
      );
    });

    it('throws HttpError on non-ok response', async () => {
      mockFetch.mockResolvedValue({ ok: false, status: 500 });

      const service = createService();

      await expect(service.checkDisplayNameValidity('Alice')).rejects.toThrow(
        `${ProfileServiceErrorMessage.CHECK_DISPLAY_NAME_VALIDITY_FAILED}: 500`,
      );
    });

    it('throws when response schema is invalid', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ invalid: 'shape' }),
      });

      const service = createService();

      await expect(service.checkDisplayNameValidity('Alice')).rejects.toThrow(
        'returned an unexpected response',
      );
    });
  });

  describe('checkBioValidity', () => {
    const mockValidityResponse = { valid: true };

    it('fetches bio validity from correct endpoint', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve(mockValidityResponse),
      });

      const service = createService();
      const result = await service.checkBioValidity('MetaMask user');

      expect(result).toStrictEqual(mockValidityResponse);
      expect(mockFetch).toHaveBeenCalledWith(
        `${V1_URL}/profiles/bio/validity?bio=MetaMask+user`,
        { headers: { Authorization: `Bearer ${MOCK_TOKEN}` } },
      );
    });

    it('throws HttpError on non-ok response', async () => {
      mockFetch.mockResolvedValue({ ok: false, status: 500 });

      const service = createService();

      await expect(service.checkBioValidity('bio text')).rejects.toThrow(
        `${ProfileServiceErrorMessage.CHECK_BIO_VALIDITY_FAILED}: 500`,
      );
    });

    it('throws when response schema is invalid', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ invalid: 'shape' }),
      });

      const service = createService();

      await expect(service.checkBioValidity('bio text')).rejects.toThrow(
        'returned an unexpected response',
      );
    });
  });

  describe('checkEarlyAccess', () => {
    const mockEarlyAccessResponse = { hasAccess: true };

    it('fetches early access status from correct endpoint', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve(mockEarlyAccessResponse),
      });

      const service = createService();
      const result = await service.checkEarlyAccess();

      expect(result).toStrictEqual(mockEarlyAccessResponse);
      expect(mockFetch).toHaveBeenCalledWith(`${V1_URL}/early-access`, {
        headers: { Authorization: `Bearer ${MOCK_TOKEN}` },
      });
    });

    it('throws HttpError on non-ok response', async () => {
      mockFetch.mockResolvedValue({ ok: false, status: 403 });

      const service = createService();

      await expect(service.checkEarlyAccess()).rejects.toThrow(
        `${ProfileServiceErrorMessage.CHECK_EARLY_ACCESS_FAILED}: 403`,
      );
    });

    it('throws when response schema is invalid', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ invalid: 'shape' }),
      });

      const service = createService();

      await expect(service.checkEarlyAccess()).rejects.toThrow(
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
        json: () => Promise.resolve(mockConnectXResponse),
      });

      const params: ConnectXParams = {
        code: 'auth-code-123',
        state: 'state-xyz',
      };
      const service = createService();
      const result = await service.connectX(params);

      expect(result).toStrictEqual(mockConnectXResponse);
      expect(mockFetch).toHaveBeenCalledWith(`${V1_URL}/profiles/x/connect`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${MOCK_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(params),
      });
    });

    it('invalidates the cached profile so the next getProfile reflects the connection', async () => {
      const connectedProfileResponse = {
        ...mockProfileResponse,
        connected_to_x: true,
      };
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: () => Promise.resolve(mockProfileResponse),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: () => Promise.resolve(mockConnectXResponse),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: () => Promise.resolve(connectedProfileResponse),
        });

      const service = createService();
      await service.getProfile('profile-123');
      await service.connectX({ code: 'auth-code-123', state: 'state-xyz' });
      const result = await service.getProfile('profile-123');

      expect(result).toStrictEqual(connectedProfileResponse);
    });

    it('keeps the cached profile when the connect request fails', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: () => Promise.resolve(mockProfileResponse),
        })
        .mockResolvedValueOnce({ ok: false, status: 401 });

      const service = createService();
      await service.getProfile('profile-123');
      await expect(
        service.connectX({ code: 'auth-code-123', state: 'state-xyz' }),
      ).rejects.toThrow(`${ProfileServiceErrorMessage.CONNECT_X_FAILED}: 401`);
      const result = await service.getProfile('profile-123');

      expect(result).toStrictEqual(mockProfileResponse);
      expect(mockFetch).toHaveBeenCalledTimes(2);
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
        json: () => Promise.resolve(mockConnectXResponse),
      });

      const service = createService();
      const result = await service.getXAccount();

      expect(result).toStrictEqual(mockConnectXResponse);
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

  describe('disconnectX', () => {
    it('sends DELETE to the shared X account endpoint', async () => {
      mockFetch.mockResolvedValue({ ok: true, status: 204, json: () => null });

      const service = createService();
      await service.disconnectX('profile-123');

      expect(mockFetch).toHaveBeenCalledWith(`${V1_URL}/profiles/x/account`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${MOCK_TOKEN}` },
      });
    });

    it('invalidates the cached profile so the next getProfile reflects the disconnection', async () => {
      const connectedProfileResponse = {
        ...mockProfileResponse,
        connected_to_x: true,
      };
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: () => Promise.resolve(connectedProfileResponse),
        })
        .mockResolvedValueOnce({ ok: true, status: 204, json: () => null })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: () => Promise.resolve(mockProfileResponse),
        });

      const service = createService();
      await service.getProfile('profile-123');
      await service.disconnectX('profile-123');
      const result = await service.getProfile('profile-123');

      expect(result).toStrictEqual(mockProfileResponse);
    });

    it('does not include the profile ID in the URL (identity comes from the bearer token)', async () => {
      mockFetch.mockResolvedValue({ ok: true, status: 204, json: () => null });

      const service = createService();
      await service.disconnectX('user/with/slashes');

      expect(mockFetch).toHaveBeenCalledWith(
        `${V1_URL}/profiles/x/account`,
        expect.anything(),
      );
    });

    it('resolves when the API returns 404 (already disconnected)', async () => {
      mockFetch.mockResolvedValue({ ok: false, status: 404 });

      const service = createService();

      await service.disconnectX('profile-123');

      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('throws HttpError on non-ok response', async () => {
      mockFetch.mockResolvedValue({ ok: false, status: 500 });

      const service = createService();

      await expect(service.disconnectX('profile-123')).rejects.toThrow(
        `${ProfileServiceErrorMessage.DISCONNECT_X_FAILED}: 500`,
      );
    });
  });
});
