import { Messenger, MOCK_ANY_NAMESPACE } from '@metamask/messenger';
import type {
  MockAnyNamespace,
  MessengerActions,
  MessengerEvents,
} from '@metamask/messenger';

import type {
  Profile,
  ProfileControllerMessenger,
} from './ProfileController.js';
import {
  ProfileController,
  getDefaultProfileControllerState,
} from './ProfileController.js';
import type {
  CreateProfileParams,
  ReplaceProfileParams,
} from './ProfileService.js';

const controllerName = 'ProfileController';

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

const mockMappedProfile: Profile = {
  profileId: 'profile-123',
  username: 'alice',
  displayName: 'Alice Wonderland',
  bio: 'MetaMask user',
  linkedAddresses: ['eip155:1:0x1234567890abcdef1234567890abcdef12345678'],
  avatarUrl: 'https://example.com/avatar.png',
  tradingPrivacy: 'public',
  connectedToX: false,
  createdAt: '2024-01-01T00:00:00Z',
  updatedAt: '2024-01-02T00:00:00Z',
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

const mockMappedXProfile = {
  xUserId: 'x-user-123',
  xProfileUrl: 'https://x.com/degengirl',
  username: 'degengirl',
  displayName: 'Degen Girl',
  avatarUrl: 'https://pbs.twimg.com/profile_images/degengirl.jpg',
  createdAt: '2024-01-01T00:00:00Z',
  updatedAt: '2024-01-02T00:00:00Z',
};

const mockXAuthUrlResponse = {
  url: 'https://x.com/i/oauth2/authorize?code_challenge=challenge-123',
  state: 'oauth-state-123',
};

const mockXConnectSession = {
  authorizationUrl:
    'https://x.com/i/oauth2/authorize?code_challenge=challenge-123',
  state: 'oauth-state-123',
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
  MessengerActions<ProfileControllerMessenger>,
  MessengerEvents<ProfileControllerMessenger>
>;

function getRootMessenger(): RootMessenger {
  return new Messenger({ namespace: MOCK_ANY_NAMESPACE });
}

function getMessenger(
  rootMessenger: RootMessenger,
): ProfileControllerMessenger {
  const messenger: ProfileControllerMessenger = new Messenger({
    namespace: controllerName,
    parent: rootMessenger,
  });
  rootMessenger.delegate({
    actions: [
      'ProfileService:createProfile',
      'ProfileService:replaceProfile',
      'ProfileService:updateProfile',
      'ProfileService:deleteProfile',
      'ProfileService:checkUsernameAvailability',
      'ProfileService:connectX',
      'ProfileService:getProfile',
      'ProfileService:getXAccount',
      'ProfileService:getXAuthUrl',
      'ProfileService:disconnectX',
    ],
    events: [],
    messenger,
  });
  return messenger;
}

function mockServiceAction(
  rootMessenger: RootMessenger,
  action: string,
  implementation: jest.Mock,
): void {
  rootMessenger.registerActionHandler(action as never, implementation as never);
}

function createController(
  options: {
    rootMessenger?: RootMessenger;
    state?: Partial<ReturnType<typeof getDefaultProfileControllerState>>;
  } = {},
): {
  controller: ProfileController;
  rootMessenger: RootMessenger;
  messenger: ProfileControllerMessenger;
} {
  const rootMessenger = options.rootMessenger ?? getRootMessenger();
  const messenger = getMessenger(rootMessenger);
  const controller = new ProfileController({
    messenger,
    state: options.state,
  });
  return { controller, rootMessenger, messenger };
}

describe('ProfileController', () => {
  describe('getDefaultProfileControllerState', () => {
    it('returns empty default state', () => {
      expect(getDefaultProfileControllerState()).toStrictEqual({
        profile: {
          profileId: '',
          username: '',
          displayName: '',
          bio: '',
          linkedAddresses: [],
          avatarUrl: '',
          tradingPrivacy: 'public',
          connectedToX: false,
          createdAt: '',
          updatedAt: '',
        },
      });
    });
  });

  describe('constructor', () => {
    it('initializes with default state', () => {
      const { controller } = createController();

      expect(controller.state).toStrictEqual(
        getDefaultProfileControllerState(),
      );
    });

    it('merges partial initial state with defaults', () => {
      const { controller } = createController({
        state: {
          profile: {
            ...getDefaultProfileControllerState().profile,
            username: 'alice',
          },
        },
      });

      expect(controller.state.profile.username).toBe('alice');
    });
  });

  describe('getProfile', () => {
    it('returns undefined when no profile has been set', () => {
      const { controller } = createController();

      expect(controller.getProfile()).toBeUndefined();
    });

    it('returns the profile when one exists in state', async () => {
      const rootMessenger = getRootMessenger();
      mockServiceAction(
        rootMessenger,
        'ProfileService:createProfile',
        jest.fn().mockResolvedValue(mockProfileResponse),
      );

      const { controller } = createController({ rootMessenger });
      await controller.createProfile({
        profile_id: 'canonical-123',
        username: 'alice',
        display_name: 'Alice Wonderland',
        linked_addresses: [
          'eip155:1:0x1234567890abcdef1234567890abcdef12345678',
        ],
        trading_privacy: 'public',
        bio: 'MetaMask user',
        avatar_url: 'https://example.com/avatar.png',
      });

      expect(controller.getProfile()).toStrictEqual(mockMappedProfile);
    });
  });

  describe('getXProfile', () => {
    it('returns undefined when no X profile exists', () => {
      const { controller } = createController();

      expect(controller.getXProfile()).toBeUndefined();
    });

    it('returns the X profile after fetchAndUpdateXAccount', async () => {
      const rootMessenger = getRootMessenger();
      mockServiceAction(
        rootMessenger,
        'ProfileService:getXAccount',
        jest.fn().mockResolvedValue(mockXConnectResponse),
      );

      const { controller } = createController({ rootMessenger });
      await controller.fetchAndUpdateXAccount();

      expect(controller.getXProfile()).toStrictEqual(mockMappedXProfile);
    });
  });

  describe('createProfile', () => {
    it('calls ProfileService:createProfile and updates state', async () => {
      const rootMessenger = getRootMessenger();
      const createProfileMock = jest
        .fn()
        .mockResolvedValue(mockProfileResponse);
      mockServiceAction(
        rootMessenger,
        'ProfileService:createProfile',
        createProfileMock,
      );

      const input: CreateProfileParams = {
        profile_id: 'canonical-123',
        username: 'alice',
        display_name: 'Alice Wonderland',
        linked_addresses: [
          'eip155:1:0x1234567890abcdef1234567890abcdef12345678',
        ],
        trading_privacy: 'public',
        bio: 'MetaMask user',
        avatar_url: 'https://example.com/avatar.png',
      };
      const { controller } = createController({ rootMessenger });
      await controller.createProfile(input);

      expect(createProfileMock).toHaveBeenCalledWith(input);
      expect(controller.state.profile).toStrictEqual(mockMappedProfile);
    });

    it('maps null bio to empty string', async () => {
      const rootMessenger = getRootMessenger();
      mockServiceAction(
        rootMessenger,
        'ProfileService:createProfile',
        jest.fn().mockResolvedValue({ ...mockProfileResponse, bio: null }),
      );

      const { controller } = createController({ rootMessenger });
      await controller.createProfile({
        profile_id: 'canonical-123',
        username: 'alice',
        display_name: 'Alice Wonderland',
        linked_addresses: [
          'eip155:1:0x1234567890abcdef1234567890abcdef12345678',
        ],
        trading_privacy: 'public',
        bio: 'MetaMask user',
        avatar_url: 'https://example.com/avatar.png',
      });

      expect(controller.state.profile.bio).toBe('');
    });

    it('maps null avatar_url to empty string', async () => {
      const rootMessenger = getRootMessenger();
      mockServiceAction(
        rootMessenger,
        'ProfileService:createProfile',
        jest
          .fn()
          .mockResolvedValue({ ...mockProfileResponse, avatar_url: null }),
      );

      const { controller } = createController({ rootMessenger });
      await controller.createProfile({
        profile_id: 'canonical-123',
        username: 'alice',
        display_name: 'Alice Wonderland',
        linked_addresses: [
          'eip155:1:0x1234567890abcdef1234567890abcdef12345678',
        ],
        trading_privacy: 'public',
        bio: 'MetaMask user',
        avatar_url: 'https://example.com/avatar.png',
      });

      expect(controller.state.profile.avatarUrl).toBe('');
    });

    it('maps connected_to_x from response', async () => {
      const rootMessenger = getRootMessenger();
      mockServiceAction(
        rootMessenger,
        'ProfileService:createProfile',
        jest
          .fn()
          .mockResolvedValue({ ...mockProfileResponse, connected_to_x: true }),
      );

      const { controller } = createController({ rootMessenger });
      await controller.createProfile({
        profile_id: 'canonical-123',
        username: 'alice',
        display_name: 'Alice Wonderland',
        linked_addresses: [
          'eip155:1:0x1234567890abcdef1234567890abcdef12345678',
        ],
        trading_privacy: 'public',
        bio: 'MetaMask user',
        avatar_url: 'https://example.com/avatar.png',
      });

      expect(controller.state.profile.connectedToX).toBe(true);
    });

    it('also updates xProfile in state when x_profile is included in the response', async () => {
      const rootMessenger = getRootMessenger();
      mockServiceAction(
        rootMessenger,
        'ProfileService:createProfile',
        jest.fn().mockResolvedValue({
          ...mockProfileResponse,
          x_profile: mockXConnectResponse,
        }),
      );

      const { controller } = createController({ rootMessenger });
      await controller.createProfile({
        profile_id: 'canonical-123',
        username: 'alice',
        display_name: 'Alice Wonderland',
        linked_addresses: [
          'eip155:1:0x1234567890abcdef1234567890abcdef12345678',
        ],
        trading_privacy: 'public',
        bio: 'MetaMask user',
        avatar_url: 'https://example.com/avatar.png',
      });

      expect(controller.state.xProfile).toStrictEqual(mockMappedXProfile);
    });

    it('is callable via messenger action', async () => {
      const rootMessenger = getRootMessenger();
      mockServiceAction(
        rootMessenger,
        'ProfileService:createProfile',
        jest.fn().mockResolvedValue(mockProfileResponse),
      );

      const { controller } = createController({ rootMessenger });

      await rootMessenger.call('ProfileController:createProfile', {
        profile_id: 'canonical-123',
        username: 'alice',
        display_name: 'Alice Wonderland',
        linked_addresses: [
          'eip155:1:0x1234567890abcdef1234567890abcdef12345678',
        ],
        trading_privacy: 'public',
        bio: 'MetaMask user',
        avatar_url: 'https://example.com/avatar.png',
      });

      expect(controller.state.profile).toStrictEqual(mockMappedProfile);
    });
  });

  describe('replaceProfile', () => {
    it('calls ProfileService:replaceProfile with profileId from state and updates state', async () => {
      const rootMessenger = getRootMessenger();
      const replaceProfileMock = jest
        .fn()
        .mockResolvedValue({ ...mockProfileResponse, username: 'alice2' });
      mockServiceAction(
        rootMessenger,
        'ProfileService:replaceProfile',
        replaceProfileMock,
      );

      const input: ReplaceProfileParams = {
        username: 'alice2',
        display_name: 'Alice 2',
        linked_addresses: ['eip155:1:0xabc'],
        trading_privacy: 'public',
        bio: 'MetaMask user',
        avatar_url: 'https://example.com/avatar.png',
      };
      const { controller } = createController({
        rootMessenger,
        state: {
          profile: {
            ...getDefaultProfileControllerState().profile,
            profileId: 'profile-123',
          },
        },
      });
      await controller.replaceProfile(input);

      expect(replaceProfileMock).toHaveBeenCalledWith('profile-123', input);
      expect(controller.state.profile.username).toBe('alice2');
    });

    it('throws if no profile is set in state', async () => {
      const { controller } = createController();

      await expect(
        controller.replaceProfile({
          username: 'alice2',
          display_name: 'Alice 2',
          linked_addresses: [
            'eip155:1:0x1234567890abcdef1234567890abcdef12345678',
          ],
          trading_privacy: 'public',
          bio: 'MetaMask user',
          avatar_url: 'https://example.com/avatar.png',
        }),
      ).rejects.toThrow('ProfileController: no profile found in state');
    });
  });

  describe('updateProfile', () => {
    it('calls ProfileService:updateProfile with profileId from state and updates state', async () => {
      const rootMessenger = getRootMessenger();
      const updateProfileMock = jest
        .fn()
        .mockResolvedValue({ ...mockProfileResponse, username: 'alice2' });
      mockServiceAction(
        rootMessenger,
        'ProfileService:updateProfile',
        updateProfileMock,
      );

      const { controller } = createController({
        rootMessenger,
        state: {
          profile: {
            ...getDefaultProfileControllerState().profile,
            profileId: 'profile-123',
          },
        },
      });
      await controller.updateProfile({ username: 'alice2' });

      expect(updateProfileMock).toHaveBeenCalledWith('profile-123', {
        username: 'alice2',
      });
      expect(controller.state.profile.username).toBe('alice2');
    });

    it('throws if no profile is set in state', async () => {
      const { controller } = createController();

      await expect(
        controller.updateProfile({ username: 'alice2' }),
      ).rejects.toThrow('ProfileController: no profile found in state');
    });
  });

  describe('deleteProfile', () => {
    it('calls ProfileService:deleteProfile using profileId from state and resets state including xProfile', async () => {
      const rootMessenger = getRootMessenger();
      const deleteProfileMock = jest.fn().mockResolvedValue(undefined);
      mockServiceAction(
        rootMessenger,
        'ProfileService:getXAccount',
        jest.fn().mockResolvedValue(mockXConnectResponse),
      );
      mockServiceAction(
        rootMessenger,
        'ProfileService:deleteProfile',
        deleteProfileMock,
      );

      const { controller } = createController({
        rootMessenger,
        state: { profile: mockMappedProfile },
      });
      await controller.fetchAndUpdateXAccount();
      expect(controller.state.xProfile).toStrictEqual(mockMappedXProfile);

      await controller.deleteProfile();

      expect(deleteProfileMock).toHaveBeenCalledWith('profile-123');
      expect(controller.state.profile).toStrictEqual(
        getDefaultProfileControllerState().profile,
      );
      expect(controller.state.xProfile).toBeUndefined();
    });

    it('throws if no profile is set in state', async () => {
      const { controller } = createController();

      await expect(controller.deleteProfile()).rejects.toThrow(
        'ProfileController: no profile found in state',
      );
    });
  });

  describe('checkUsernameAvailability', () => {
    it('delegates to ProfileService:checkUsernameAvailability', async () => {
      const rootMessenger = getRootMessenger();
      const checkMock = jest.fn().mockResolvedValue(mockAvailabilityResponse);
      mockServiceAction(
        rootMessenger,
        'ProfileService:checkUsernameAvailability',
        checkMock,
      );

      const { controller } = createController({ rootMessenger });
      const result = await controller.checkUsernameAvailability('alice');

      expect(checkMock).toHaveBeenCalledWith('alice');
      expect(result).toStrictEqual(mockAvailabilityResponse);
    });

    it('does not update state', async () => {
      const rootMessenger = getRootMessenger();
      mockServiceAction(
        rootMessenger,
        'ProfileService:checkUsernameAvailability',
        jest.fn().mockResolvedValue(mockAvailabilityResponse),
      );

      const { controller } = createController({ rootMessenger });
      const stateBefore = controller.state;
      await controller.checkUsernameAvailability('alice');

      expect(controller.state).toStrictEqual(stateBefore);
    });
  });

  describe('connectX', () => {
    it('connects, fetches the profile, persists both in state, and returns the connect result', async () => {
      const rootMessenger = getRootMessenger();
      const connectXMock = jest.fn().mockResolvedValue({
        ...mockXConnectResponse,
        profile_created: true,
      });
      mockServiceAction(rootMessenger, 'ProfileService:connectX', connectXMock);
      const getProfileMock = jest.fn().mockResolvedValue({
        ...mockProfileResponse,
        connected_to_x: true,
      });
      mockServiceAction(
        rootMessenger,
        'ProfileService:getProfile',
        getProfileMock,
      );

      const { controller, messenger } = createController({ rootMessenger });
      const stateChangedListener = jest.fn();
      messenger.subscribe(
        'ProfileController:stateChanged',
        stateChangedListener,
      );

      const result = await controller.connectX({
        code: 'auth-code-123',
        state: 'state-xyz',
        profileId: 'profile-123',
      });

      expect(connectXMock).toHaveBeenCalledWith({
        code: 'auth-code-123',
        state: 'state-xyz',
      });
      expect(getProfileMock).toHaveBeenCalledWith('profile-123');
      expect(result).toStrictEqual({
        profile: { ...mockMappedProfile, connectedToX: true },
        xProfile: mockMappedXProfile,
        profileCreated: true,
      });
      expect(controller.state.profile).toStrictEqual({
        ...mockMappedProfile,
        connectedToX: true,
      });
      expect(controller.state.xProfile).toStrictEqual(mockMappedXProfile);
      // xProfile is persisted in its own update before the profile fetch,
      // then the profile update emits a second state change.
      expect(stateChangedListener).toHaveBeenCalledTimes(2);
    });

    it('defaults profileCreated to false when the backend does not report it', async () => {
      const rootMessenger = getRootMessenger();
      mockServiceAction(
        rootMessenger,
        'ProfileService:connectX',
        jest.fn().mockResolvedValue(mockXConnectResponse),
      );
      mockServiceAction(
        rootMessenger,
        'ProfileService:getProfile',
        jest.fn().mockResolvedValue(mockProfileResponse),
      );

      const { controller } = createController({ rootMessenger });
      const result = await controller.connectX({
        code: 'auth-code-123',
        state: 'state-xyz',
        profileId: 'profile-123',
      });

      expect(result.profileCreated).toBe(false);
    });

    it('persists xProfile and rethrows when the follow-up profile fetch fails', async () => {
      const rootMessenger = getRootMessenger();
      mockServiceAction(
        rootMessenger,
        'ProfileService:connectX',
        jest.fn().mockResolvedValue({
          ...mockXConnectResponse,
          profile_created: true,
        }),
      );
      mockServiceAction(
        rootMessenger,
        'ProfileService:getProfile',
        jest.fn().mockRejectedValue(new Error('503 Service Unavailable')),
      );

      const { controller } = createController({ rootMessenger });

      await expect(
        controller.connectX({
          code: 'auth-code-123',
          state: 'state-xyz',
          profileId: 'profile-123',
        }),
      ).rejects.toThrow(
        'ProfileController: connected the X account, but failed to fetch the profile afterwards',
      );
      expect(controller.state.xProfile).toStrictEqual(mockMappedXProfile);
      expect(controller.state.profile).toStrictEqual(
        getDefaultProfileControllerState().profile,
      );
    });

    it('leaves the existing profile in state unchanged when the follow-up fetch fails', async () => {
      const rootMessenger = getRootMessenger();
      mockServiceAction(
        rootMessenger,
        'ProfileService:connectX',
        jest.fn().mockResolvedValue(mockXConnectResponse),
      );
      mockServiceAction(
        rootMessenger,
        'ProfileService:getProfile',
        jest.fn().mockRejectedValue(new Error('503 Service Unavailable')),
      );

      const { controller } = createController({
        rootMessenger,
        state: { profile: mockMappedProfile },
      });

      await expect(
        controller.connectX({
          code: 'auth-code-123',
          state: 'state-xyz',
          profileId: mockMappedProfile.profileId,
        }),
      ).rejects.toThrow('failed to fetch the profile afterwards');
      expect(controller.state.profile).toStrictEqual(mockMappedProfile);
      expect(controller.state.xProfile).toStrictEqual(mockMappedXProfile);
    });

    it('does not touch state or fetch the profile when the connect itself fails', async () => {
      const rootMessenger = getRootMessenger();
      mockServiceAction(
        rootMessenger,
        'ProfileService:connectX',
        jest.fn().mockRejectedValue(new Error('401 Unauthorized')),
      );
      const getProfileMock = jest.fn();
      mockServiceAction(
        rootMessenger,
        'ProfileService:getProfile',
        getProfileMock,
      );

      const { controller } = createController({ rootMessenger });

      await expect(
        controller.connectX({
          code: 'bad-code',
          state: 'state-xyz',
          profileId: 'profile-123',
        }),
      ).rejects.toThrow('401 Unauthorized');
      expect(getProfileMock).not.toHaveBeenCalled();
      expect(controller.state).toStrictEqual(
        getDefaultProfileControllerState(),
      );
    });

    it('is callable via messenger action', async () => {
      const rootMessenger = getRootMessenger();
      mockServiceAction(
        rootMessenger,
        'ProfileService:connectX',
        jest.fn().mockResolvedValue(mockXConnectResponse),
      );
      mockServiceAction(
        rootMessenger,
        'ProfileService:getProfile',
        jest.fn().mockResolvedValue(mockProfileResponse),
      );

      const { controller } = createController({ rootMessenger });

      const result = await rootMessenger.call('ProfileController:connectX', {
        code: 'auth-code-123',
        state: 'state-xyz',
        profileId: 'profile-123',
      });

      expect(result).toStrictEqual({
        profile: mockMappedProfile,
        xProfile: mockMappedXProfile,
        profileCreated: false,
      });
      expect(controller.state.profile).toStrictEqual(mockMappedProfile);
      expect(controller.state.xProfile).toStrictEqual(mockMappedXProfile);
    });
  });

  describe('startXConnect', () => {
    it('calls ProfileService:getXAuthUrl and returns the authorization URL and state', async () => {
      const rootMessenger = getRootMessenger();
      const getXAuthUrlMock = jest.fn().mockResolvedValue(mockXAuthUrlResponse);
      mockServiceAction(
        rootMessenger,
        'ProfileService:getXAuthUrl',
        getXAuthUrlMock,
      );

      const { controller } = createController({ rootMessenger });
      const result = await controller.startXConnect();

      expect(getXAuthUrlMock).toHaveBeenCalledTimes(1);
      expect(getXAuthUrlMock).toHaveBeenCalledWith();
      expect(result).toStrictEqual(mockXConnectSession);
    });

    it('passes the linked address to ProfileService:getXAuthUrl when given', async () => {
      const rootMessenger = getRootMessenger();
      const getXAuthUrlMock = jest.fn().mockResolvedValue(mockXAuthUrlResponse);
      mockServiceAction(
        rootMessenger,
        'ProfileService:getXAuthUrl',
        getXAuthUrlMock,
      );

      const { controller } = createController({ rootMessenger });
      const result = await controller.startXConnect({
        linkedAddress: 'eip155:0:0x1234567890abcdef1234567890abcdef12345678',
      });

      expect(getXAuthUrlMock).toHaveBeenCalledWith(
        'eip155:0:0x1234567890abcdef1234567890abcdef12345678',
      );
      expect(result).toStrictEqual(mockXConnectSession);
      expect(controller.state.xProfile).toBeUndefined();
    });

    it('does not update controller state', async () => {
      const rootMessenger = getRootMessenger();
      mockServiceAction(
        rootMessenger,
        'ProfileService:getXAuthUrl',
        jest.fn().mockResolvedValue(mockXAuthUrlResponse),
      );

      const { controller } = createController({ rootMessenger });
      const stateBefore = controller.state;
      await controller.startXConnect();

      expect(controller.state).toStrictEqual(stateBefore);
    });

    it('is callable via messenger action', async () => {
      const rootMessenger = getRootMessenger();
      mockServiceAction(
        rootMessenger,
        'ProfileService:getXAuthUrl',
        jest.fn().mockResolvedValue(mockXAuthUrlResponse),
      );

      const { controller } = createController({ rootMessenger });
      const result = await rootMessenger.call(
        'ProfileController:startXConnect',
      );

      expect(result).toStrictEqual(mockXConnectSession);
      expect(controller.state.xProfile).toBeUndefined();
    });
  });

  describe('fetchAndUpdateXAccount', () => {
    it('calls ProfileService:getXAccount and updates xProfile in state', async () => {
      const rootMessenger = getRootMessenger();
      const getXAccountMock = jest.fn().mockResolvedValue(mockXConnectResponse);
      mockServiceAction(
        rootMessenger,
        'ProfileService:getXAccount',
        getXAccountMock,
      );

      const { controller } = createController({ rootMessenger });
      await controller.fetchAndUpdateXAccount();

      expect(getXAccountMock).toHaveBeenCalledTimes(1);
      expect(getXAccountMock).toHaveBeenCalledWith();
      expect(controller.state.xProfile).toStrictEqual(mockMappedXProfile);
    });
  });

  describe('disconnectX', () => {
    it('calls ProfileService:disconnectX with the profile ID, clears xProfile, and sets connectedToX to false', async () => {
      const rootMessenger = getRootMessenger();
      const disconnectXMock = jest.fn().mockResolvedValue(undefined);
      mockServiceAction(
        rootMessenger,
        'ProfileService:disconnectX',
        disconnectXMock,
      );
      mockServiceAction(
        rootMessenger,
        'ProfileService:getXAccount',
        jest.fn().mockResolvedValue(mockXConnectResponse),
      );

      const { controller, messenger } = createController({
        rootMessenger,
        state: {
          profile: {
            ...getDefaultProfileControllerState().profile,
            profileId: 'profile-123',
            connectedToX: true,
          },
        },
      });
      await controller.fetchAndUpdateXAccount();
      expect(controller.state.xProfile).toStrictEqual(mockMappedXProfile);

      const stateChangedListener = jest.fn();
      messenger.subscribe(
        'ProfileController:stateChanged',
        stateChangedListener,
      );

      await controller.disconnectX('profile-123');

      expect(disconnectXMock).toHaveBeenCalledTimes(1);
      expect(disconnectXMock).toHaveBeenCalledWith('profile-123');
      expect(controller.state.xProfile).toBeUndefined();
      expect(controller.state.profile.connectedToX).toBe(false);
      expect(stateChangedListener).toHaveBeenCalledTimes(1);
    });

    it('does not change profile.connectedToX when the profile ID does not match state', async () => {
      const rootMessenger = getRootMessenger();
      mockServiceAction(
        rootMessenger,
        'ProfileService:disconnectX',
        jest.fn().mockResolvedValue(undefined),
      );

      const { controller } = createController({
        rootMessenger,
        state: {
          profile: {
            ...getDefaultProfileControllerState().profile,
            profileId: 'profile-123',
            connectedToX: true,
          },
        },
      });

      await controller.disconnectX('other-profile');

      expect(controller.state.xProfile).toBeUndefined();
      expect(controller.state.profile.connectedToX).toBe(true);
    });

    it('is callable via messenger action', async () => {
      const rootMessenger = getRootMessenger();
      const disconnectXMock = jest.fn().mockResolvedValue(undefined);
      mockServiceAction(
        rootMessenger,
        'ProfileService:disconnectX',
        disconnectXMock,
      );

      const { controller } = createController({
        rootMessenger,
        state: {
          profile: {
            ...getDefaultProfileControllerState().profile,
            profileId: 'profile-123',
            connectedToX: true,
          },
        },
      });

      await rootMessenger.call('ProfileController:disconnectX', 'profile-123');

      expect(disconnectXMock).toHaveBeenCalledWith('profile-123');
      expect(controller.state.xProfile).toBeUndefined();
      expect(controller.state.profile.connectedToX).toBe(false);
    });
  });
});
