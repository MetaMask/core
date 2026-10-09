import type {
  ConnectXParams,
  CreateProfileParams,
  CreateProfileResponse,
  ProfileApiResponse,
  ProfileServiceMessenger,
  ReplaceProfileParams,
  UpdateProfileParams,
  UsernameAvailabilityResponse,
  XAccountResponse,
  XAuthUrlResponse,
  XConnectResponse,
} from './ProfileService.js';

export const MOCK_PROFILE_API_RESPONSE: ProfileApiResponse = {
  profile_id: 'mock-profile-id',
  username: 'mockuser',
  display_name: 'Mock User',
  bio: null,
  linked_addresses: [
    'eip155:1:0xab16a96D359eC26a11e2C2b3d8f8B8942d5Bfcdb',
    'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp:EEivRh9T4GTLEJprEaKQyjSQzW13JRb5D7jSpvPQ8296',
    'bip122:000000000019d6689c085ae165831e93:128Lkh3S7CkDTBZ8W7BbpsN3YYizJMp8p6',
    'tron:728126428:TLyqzVGLV1srkB7dToTAEqgDSfPtXRJZYH',
    'stellar:pubnet:GBRPYHIL2CI3FNQ4BXLFMNDLFJUNPU2HY3ZMFSHONUCEOASW7QC7OX2H',
  ],
  avatar_url: 'https://pbs.twimg.com/profile_images/mock.jpg',
  trading_privacy: 'public',
  connected_to_x: true,
  created_at: '2024-01-01T00:00:00.000Z',
  updated_at: '2024-01-01T00:00:00.000Z',
};

export const MOCK_X_CONNECT_RESPONSE: XConnectResponse = {
  x_user_id: 'mock-x-user-id',
  x_profile_url: 'https://x.com/mockuser',
  username: 'mockuser',
  display_name: 'Mock User',
  avatar_url: 'https://pbs.twimg.com/profile_images/mock.jpg',
  created_at: '2024-01-01T00:00:00.000Z',
  updated_at: '2024-01-01T00:00:00.000Z',
};

export const MOCK_X_AUTH_URL_RESPONSE: XAuthUrlResponse = {
  url: 'https://x.com/i/oauth2/authorize?mock=true',
  state: 'mock-oauth-state',
};

export type MockProfileServiceHandlers = {
  getProfile?: (profileId: string) => Promise<ProfileApiResponse>;
  createProfile?: (
    params: CreateProfileParams,
  ) => Promise<CreateProfileResponse>;
  replaceProfile?: (
    profileId: string,
    params: ReplaceProfileParams,
  ) => Promise<ProfileApiResponse>;
  updateProfile?: (
    profileId: string,
    params: UpdateProfileParams,
  ) => Promise<ProfileApiResponse>;
  deleteProfile?: (profileId: string) => Promise<void>;
  checkUsernameAvailability?: (
    username: string,
  ) => Promise<UsernameAvailabilityResponse>;
  getXAuthUrl?: () => Promise<XAuthUrlResponse>;
  connectX?: (params: ConnectXParams) => Promise<XConnectResponse>;
  getXAccount?: () => Promise<XAccountResponse>;
};

/**
 * Registers stub action handlers for all ProfileService methods on the provided messenger.
 * Use this in place of instantiating a real ProfileService when the profile API is unavailable.
 *
 * @param messenger - The ProfileServiceMessenger to register handlers on.
 * @param handlers - Optional per-method overrides. Unspecified methods return fixture data.
 */
export function buildMockProfileService(
  messenger: ProfileServiceMessenger,
  handlers: MockProfileServiceHandlers = {},
): void {
  messenger.registerActionHandler(
    'ProfileService:getProfile',
    handlers.getProfile ??
      (async (_profileId): Promise<ProfileApiResponse> =>
        MOCK_PROFILE_API_RESPONSE),
  );

  messenger.registerActionHandler(
    'ProfileService:createProfile',
    handlers.createProfile ??
      (async (_params): Promise<CreateProfileResponse> =>
        MOCK_PROFILE_API_RESPONSE),
  );

  messenger.registerActionHandler(
    'ProfileService:replaceProfile',
    handlers.replaceProfile ??
      (async (_profileId, _params): Promise<ProfileApiResponse> =>
        MOCK_PROFILE_API_RESPONSE),
  );

  messenger.registerActionHandler(
    'ProfileService:updateProfile',
    handlers.updateProfile ??
      (async (_profileId, _params): Promise<ProfileApiResponse> =>
        MOCK_PROFILE_API_RESPONSE),
  );

  messenger.registerActionHandler(
    'ProfileService:deleteProfile',
    handlers.deleteProfile ?? (async (_profileId): Promise<void> => undefined),
  );

  messenger.registerActionHandler(
    'ProfileService:checkUsernameAvailability',
    handlers.checkUsernameAvailability ??
      (async (username): Promise<UsernameAvailabilityResponse> => ({
        username,
        available: true,
        valid: true,
        normalized: username,
        errors: [],
      })),
  );

  messenger.registerActionHandler(
    'ProfileService:getXAuthUrl',
    handlers.getXAuthUrl ??
      (async (): Promise<XAuthUrlResponse> => MOCK_X_AUTH_URL_RESPONSE),
  );

  messenger.registerActionHandler(
    'ProfileService:connectX',
    handlers.connectX ??
      (async (_params): Promise<XConnectResponse> => MOCK_X_CONNECT_RESPONSE),
  );

  messenger.registerActionHandler(
    'ProfileService:getXAccount',
    handlers.getXAccount ??
      (async (): Promise<XAccountResponse> => MOCK_X_CONNECT_RESPONSE),
  );
}
