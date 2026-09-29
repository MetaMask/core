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
      'ProfileService:getXAccount',
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

      const input = {
        profile_id: 'canonical-123',
        username: 'alice',
        display_name: 'Alice Wonderland',
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

      const input = {
        username: 'alice2',
        display_name: 'Alice 2',
        linked_addresses: ['eip155:1:0xabc'],
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
          linked_addresses: [],
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
    it('calls ProfileService:connectX with code and state and returns the X profile', async () => {
      const rootMessenger = getRootMessenger();
      const connectXMock = jest.fn().mockResolvedValue(mockXConnectResponse);
      mockServiceAction(rootMessenger, 'ProfileService:connectX', connectXMock);

      const { controller } = createController({ rootMessenger });
      const result = await controller.connectX({
        code: 'auth-code-123',
        state: 'state-xyz',
      });

      expect(connectXMock).toHaveBeenCalledWith({
        code: 'auth-code-123',
        state: 'state-xyz',
      });
      expect(result).toStrictEqual(mockMappedXProfile);
      expect(controller.state.xProfile).toBeUndefined();
    });
  });

  describe('fetchAndUpdateXAccount', () => {
    it('calls ProfileService:getXAccount and updates xProfile in state', async () => {
      const rootMessenger = getRootMessenger();
      mockServiceAction(
        rootMessenger,
        'ProfileService:getXAccount',
        jest.fn().mockResolvedValue(mockXConnectResponse),
      );

      const { controller } = createController({ rootMessenger });
      await controller.fetchAndUpdateXAccount();

      expect(controller.state.xProfile).toStrictEqual(mockMappedXProfile);
    });
  });
});
