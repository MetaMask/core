import { Messenger, MOCK_ANY_NAMESPACE } from '@metamask/messenger';
import type {
  MockAnyNamespace,
  MessengerActions,
  MessengerEvents,
} from '@metamask/messenger';

import { SocialServiceErrorMessage, serviceName } from './social-constants';
import type { SocialServiceMessenger } from './SocialService';
import { SocialService } from './SocialService';

const BASE_URL = 'http://test.com';
const V1_URL = `${BASE_URL}/api/v1`;
const V2_URL = `${BASE_URL}/api/v2`;

const mockProfileSummary = {
  profileId: '550e8400-e29b-41d4-a716-446655440000',
  address: '0x1234567890abcdef1234567890abcdef12345678',
  name: 'TraderAlice',
  imageUrl: 'https://example.com/avatar.png',
};

const mockSocialHandles = {
  twitter: '@traderalice',
  farcaster: 'traderalice.eth',
  ens: 'traderalice.eth',
  lens: 'traderalice',
};

const mockTrade = {
  direction: 'buy',
  intent: 'enter',
  tokenAmount: 1.5,
  usdCost: 3000,
  timestamp: 1700000000,
  transactionHash:
    '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
};

const mockPosition = {
  tokenSymbol: 'ETH',
  tokenName: 'Ethereum',
  tokenAddress: '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
  chain: 'base',
  positionAmount: 1.5,
  boughtUsd: 3000,
  soldUsd: 0,
  realizedPnl: 0,
  costBasis: 3000,
  trades: [mockTrade],
  lastTradeAt: 1700000000,
  tokenImageUrl: 'https://assets.daylight.xyz/images/token-eth.png',
};

const MOCK_TOKEN = 'mock-bearer-token';

type RootMessenger = Messenger<
  MockAnyNamespace,
  MessengerActions<SocialServiceMessenger>,
  MessengerEvents<SocialServiceMessenger>
>;

function getRootMessenger(): RootMessenger {
  return new Messenger({ namespace: MOCK_ANY_NAMESPACE });
}

function createMessenger(
  rootMessenger?: RootMessenger,
): SocialServiceMessenger {
  const root = rootMessenger ?? getRootMessenger();

  root.registerActionHandler(
    'AuthenticationController:getBearerToken',
    async () => MOCK_TOKEN,
  );

  const serviceMessenger: SocialServiceMessenger = new Messenger({
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
  options: { messenger?: SocialServiceMessenger } = {},
): SocialService {
  const messenger = options.messenger ?? createMessenger();
  return new SocialService({ messenger, baseUrl: BASE_URL });
}

describe('SocialService', () => {
  const mockFetch = jest.fn();
  const originalFetch = global.fetch;

  beforeEach(() => {
    global.fetch = mockFetch;
    mockFetch.mockReset();
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  describe('fetchLeaderboard', () => {
    const mockLeaderboardResponse = {
      traders: [
        {
          rank: 1,
          addresses: ['0x1234567890abcdef1234567890abcdef12345678'],
          profileId: '550e8400-e29b-41d4-a716-446655440000',
          name: 'TraderAlice',
          imageUrl: 'https://example.com/avatar.png',
          pnl30d: 50000,
          winRate30d: 0.75,
          roiPercent30d: 2.5,
          tradeCount30d: 42,
          pnl7d: 10000,
          winRate7d: 0.7,
          roiPercent7d: 1.2,
          tradeCount7d: 15,
          pnlPerChain: { base: 30000, solana: 20000 },
          followerCount: 100,
          socialHandles: mockSocialHandles,
        },
      ],
    };

    it('fetches leaderboard from correct endpoint', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve(mockLeaderboardResponse),
      });

      const service = createService();
      const result = await service.fetchLeaderboard();

      expect(result).toStrictEqual(mockLeaderboardResponse);
      expect(mockFetch).toHaveBeenCalledWith(`${V1_URL}/leaderboard`, {
        headers: { Authorization: `Bearer ${MOCK_TOKEN}` },
      });
    });

    it('appends sort, chains, and limit query params', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve(mockLeaderboardResponse),
      });

      const service = createService();
      await service.fetchLeaderboard({
        sort: 'roi',
        chains: ['base', 'solana'],
        limit: 10,
      });

      const calledUrl = mockFetch.mock.calls[0][0] as string;
      expect(calledUrl).toContain('sort=roi');
      expect(calledUrl).toContain('chains=base');
      expect(calledUrl).toContain('chains=solana');
      expect(calledUrl).toContain('limit=10');
    });

    it('throws HttpError on non-ok response', async () => {
      mockFetch.mockResolvedValue({ ok: false, status: 500 });

      const service = createService();

      await expect(service.fetchLeaderboard()).rejects.toThrow(
        `${SocialServiceErrorMessage.FETCH_LEADERBOARD_FAILED}: 500`,
      );
    });

    it('throws when response schema is invalid', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ traders: 'not-an-array' }),
      });

      const service = createService();

      await expect(service.fetchLeaderboard()).rejects.toThrow(
        SocialServiceErrorMessage.FETCH_LEADERBOARD_INVALID_RESPONSE,
      );
    });

    it('throws when a trader entry has invalid socialHandles', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            traders: [
              {
                ...mockLeaderboardResponse.traders[0],
                socialHandles: { twitter: 123 },
              },
            ],
          }),
      });

      const service = createService();

      await expect(service.fetchLeaderboard()).rejects.toThrow(
        SocialServiceErrorMessage.FETCH_LEADERBOARD_INVALID_RESPONSE,
      );
    });

    it('accepts entries with optional fields omitted', async () => {
      const minimalTrader = {
        rank: 1,
        addresses: ['0x1234567890abcdef1234567890abcdef12345678'],
        profileId: '550e8400-e29b-41d4-a716-446655440000',
        name: 'TraderAlice',
        pnl30d: 50000,
        pnlPerChain: {},
        followerCount: 100,
        socialHandles: {},
      };

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ traders: [minimalTrader] }),
      });

      const service = createService();
      const result = await service.fetchLeaderboard();

      expect(result.traders[0].name).toBe('TraderAlice');
    });

    it('is callable via messenger action', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve(mockLeaderboardResponse),
      });

      const messenger = createMessenger();
      // eslint-disable-next-line no-new
      new SocialService({ messenger, baseUrl: BASE_URL });

      const result = await messenger.call(
        'SocialService:fetchLeaderboard',
        undefined,
      );

      expect(result).toStrictEqual(mockLeaderboardResponse);
    });
  });

  describe('fetchTraderProfile', () => {
    const mockProfileResponse = {
      profile: {
        profileId: '550e8400-e29b-41d4-a716-446655440000',
        address: '0x1234567890abcdef1234567890abcdef12345678',
        allAddresses: ['0x1234567890abcdef1234567890abcdef12345678'],
        name: 'TraderAlice',
        imageUrl: 'https://example.com/avatar.png',
      },
      stats: {
        pnl30d: 50000,
        winRate30d: 0.75,
        roiPercent30d: 2.5,
        tradeCount30d: 42,
        pnl7d: 10000,
        winRate7d: 0.7,
        roiPercent7d: 1.2,
        tradeCount7d: 15,
        medianHoldMinutes: 120,
      },
      perChainBreakdown: {
        perChainPnl: { base: 30000 },
        perChainRoi: { base: 2.5 },
        perChainVolume: { base: 100000 },
      },
      socialHandles: mockSocialHandles,
      followerCount: 100,
      followingCount: 50,
    };

    it('fetches trader profile from correct endpoint', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve(mockProfileResponse),
      });

      const service = createService();
      const result = await service.fetchTraderProfile({
        addressOrId: '0x1234',
      });

      expect(result).toStrictEqual(mockProfileResponse);
      expect(mockFetch).toHaveBeenCalledWith(
        `${V1_URL}/traders/0x1234/profile`,
        { headers: { Authorization: `Bearer ${MOCK_TOKEN}` } },
      );
    });

    it('encodes the address in the URL', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve(mockProfileResponse),
      });

      const service = createService();
      await service.fetchTraderProfile({
        addressOrId: 'addr/with/slashes',
      });

      expect(mockFetch).toHaveBeenCalledWith(
        `${V1_URL}/traders/addr%2Fwith%2Fslashes/profile`,
        { headers: { Authorization: `Bearer ${MOCK_TOKEN}` } },
      );
    });

    it('throws HttpError on non-ok response', async () => {
      mockFetch.mockResolvedValue({ ok: false, status: 404 });

      const service = createService();

      await expect(
        service.fetchTraderProfile({ addressOrId: '0x1234' }),
      ).rejects.toThrow(
        `${SocialServiceErrorMessage.FETCH_TRADER_PROFILE_FAILED}: 404`,
      );
    });

    it('throws when response schema is invalid', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ profile: 'not-an-object' }),
      });

      const service = createService();

      await expect(
        service.fetchTraderProfile({ addressOrId: '0x1234' }),
      ).rejects.toThrow(
        SocialServiceErrorMessage.FETCH_TRADER_PROFILE_INVALID_RESPONSE,
      );
    });

    it('accepts profile with optional stats omitted', async () => {
      const withMinimalStats = {
        ...mockProfileResponse,
        stats: {},
      };

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve(withMinimalStats),
      });

      const service = createService();
      const result = await service.fetchTraderProfile({
        addressOrId: '0x1234',
      });

      expect(result.stats).toStrictEqual({});
    });
  });

  describe('fetchOpenPositions', () => {
    const mockPositionsResponse = {
      positions: [mockPosition],
      pagination: { hasMore: true, nextPage: 2 },
    };

    it('fetches open positions from correct endpoint', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve(mockPositionsResponse),
      });

      const service = createService();
      const result = await service.fetchOpenPositions({
        addressOrId: '0x1234',
      });

      expect(result).toStrictEqual(mockPositionsResponse);
      expect(mockFetch).toHaveBeenCalledWith(
        `${V2_URL}/traders/0x1234/positions/open`,
        { headers: { Authorization: `Bearer ${MOCK_TOKEN}` } },
      );
    });

    it('appends chain, limit, and page query params (sort is ignored for v2 open positions)', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve(mockPositionsResponse),
      });

      const service = createService();
      await service.fetchOpenPositions({
        addressOrId: '0x1234',
        chain: 'base',
        sort: 'value',
        limit: 10,
        page: 2,
      });

      const calledUrl = mockFetch.mock.calls[0][0] as string;
      expect(calledUrl).toContain('chain=base');
      expect(calledUrl).not.toContain('sort=');
      expect(calledUrl).toContain('limit=10');
      expect(calledUrl).toContain('page=2');
    });

    it('uses the same cache entry for different sort values on open positions', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve(mockPositionsResponse),
      });

      const service = createService();
      await service.fetchOpenPositions({
        addressOrId: '0x1234',
        sort: 'value',
      });
      await service.fetchOpenPositions({
        addressOrId: '0x1234',
        sort: 'latest',
      });

      // Both calls resolve to the same cache key, so the network is hit only once
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('throws HttpError on non-ok response', async () => {
      mockFetch.mockResolvedValue({ ok: false, status: 500 });

      const service = createService();

      await expect(
        service.fetchOpenPositions({ addressOrId: '0x1234' }),
      ).rejects.toThrow(
        `${SocialServiceErrorMessage.FETCH_OPEN_POSITIONS_FAILED}: 500`,
      );
    });

    it('throws when response schema is invalid', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({ positions: 'not-an-array', pagination: {} }),
      });

      const service = createService();

      await expect(
        service.fetchOpenPositions({ addressOrId: '0x1234' }),
      ).rejects.toThrow(
        SocialServiceErrorMessage.FETCH_OPEN_POSITIONS_INVALID_RESPONSE,
      );
    });

    it('throws when a trade has invalid fields', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            positions: [
              {
                ...mockPosition,
                trades: [{ ...mockTrade, tokenAmount: 'not-a-number' }],
              },
            ],
            pagination: { hasMore: false },
          }),
      });

      const service = createService();

      await expect(
        service.fetchOpenPositions({ addressOrId: '0x1234' }),
      ).rejects.toThrow(
        SocialServiceErrorMessage.FETCH_OPEN_POSITIONS_INVALID_RESPONSE,
      );
    });
  });

  describe('fetchClosedPositions', () => {
    const mockPositionsResponse = {
      positions: [mockPosition],
      pagination: { hasMore: false },
    };

    it('fetches closed positions from correct endpoint', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve(mockPositionsResponse),
      });

      const service = createService();
      const result = await service.fetchClosedPositions({
        addressOrId: '0x1234',
      });

      expect(result).toStrictEqual(mockPositionsResponse);
      expect(mockFetch).toHaveBeenCalledWith(
        `${V1_URL}/traders/0x1234/positions/closed`,
        { headers: { Authorization: `Bearer ${MOCK_TOKEN}` } },
      );
    });

    it('appends sort query param for closed positions', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve(mockPositionsResponse),
      });

      const service = createService();
      await service.fetchClosedPositions({
        addressOrId: '0x1234',
        sort: 'value',
      });

      const calledUrl = mockFetch.mock.calls[0][0] as string;
      expect(calledUrl).toContain('sort=value');
    });

    it('throws HttpError on non-ok response', async () => {
      mockFetch.mockResolvedValue({ ok: false, status: 503 });

      const service = createService();

      await expect(
        service.fetchClosedPositions({ addressOrId: '0x1234' }),
      ).rejects.toThrow(
        `${SocialServiceErrorMessage.FETCH_CLOSED_POSITIONS_FAILED}: 503`,
      );
    });
  });

  describe('fetchFollowers', () => {
    const mockFollowersResponse = {
      followers: [mockProfileSummary],
      count: 1,
    };

    it('fetches followers from correct endpoint', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve(mockFollowersResponse),
      });

      const service = createService();
      const result = await service.fetchFollowers({
        addressOrId: '0x1234',
      });

      expect(result).toStrictEqual(mockFollowersResponse);
      expect(mockFetch).toHaveBeenCalledWith(
        `${V1_URL}/traders/0x1234/followers`,
        { headers: { Authorization: `Bearer ${MOCK_TOKEN}` } },
      );
    });

    it('throws HttpError on non-ok response', async () => {
      mockFetch.mockResolvedValue({ ok: false, status: 500 });

      const service = createService();

      await expect(
        service.fetchFollowers({ addressOrId: '0x1234' }),
      ).rejects.toThrow(
        `${SocialServiceErrorMessage.FETCH_FOLLOWERS_FAILED}: 500`,
      );
    });

    it('throws when response schema is invalid', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ followers: 'not-an-array', count: 1 }),
      });

      const service = createService();

      await expect(
        service.fetchFollowers({ addressOrId: '0x1234' }),
      ).rejects.toThrow(
        SocialServiceErrorMessage.FETCH_FOLLOWERS_INVALID_RESPONSE,
      );
    });

    it('throws when a profile summary has invalid fields', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            followers: [{ profileId: 123, address: '0x', name: 'test' }],
            count: 1,
          }),
      });

      const service = createService();

      await expect(
        service.fetchFollowers({ addressOrId: '0x1234' }),
      ).rejects.toThrow(
        SocialServiceErrorMessage.FETCH_FOLLOWERS_INVALID_RESPONSE,
      );
    });
  });

  describe('fetchFollowing', () => {
    const mockFollowingResponse = {
      following: [mockProfileSummary],
      count: 1,
    };

    it('fetches following from correct endpoint', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve(mockFollowingResponse),
      });

      const service = createService();
      const result = await service.fetchFollowing({
        addressOrUid: '0x1234',
      });

      expect(result).toStrictEqual(mockFollowingResponse);
      expect(mockFetch).toHaveBeenCalledWith(
        `${V1_URL}/users/0x1234/following`,
        { headers: { Authorization: `Bearer ${MOCK_TOKEN}` } },
      );
    });

    it('throws HttpError on non-ok response', async () => {
      mockFetch.mockResolvedValue({ ok: false, status: 500 });

      const service = createService();

      await expect(
        service.fetchFollowing({ addressOrUid: '0x1234' }),
      ).rejects.toThrow(
        `${SocialServiceErrorMessage.FETCH_FOLLOWING_FAILED}: 500`,
      );
    });

    it('throws when response schema is invalid', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ following: 'not-an-array', count: 1 }),
      });

      const service = createService();

      await expect(
        service.fetchFollowing({ addressOrUid: '0x1234' }),
      ).rejects.toThrow(
        SocialServiceErrorMessage.FETCH_FOLLOWING_INVALID_RESPONSE,
      );
    });

    it('always fetches fresh data on repeated calls (staleTime: 0)', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve(mockFollowingResponse),
      });

      const service = createService();
      await service.fetchFollowing({ addressOrUid: '0x1234' });
      await service.fetchFollowing({ addressOrUid: '0x1234' });

      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });

  describe('follow', () => {
    const mockFollowResponse = {
      followed: [mockProfileSummary],
    };

    it('sends PUT request with targets in body', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve(mockFollowResponse),
      });

      const service = createService();
      const result = await service.follow({
        addressOrUid: '0x1234',
        targets: ['0xaaaa', '0xbbbb'],
      });

      expect(result).toStrictEqual(mockFollowResponse);
      expect(mockFetch).toHaveBeenCalledWith(`${V1_URL}/users/0x1234/follows`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${MOCK_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ targets: ['0xaaaa', '0xbbbb'] }),
      });
    });

    it('throws HttpError on non-ok response', async () => {
      mockFetch.mockResolvedValue({ ok: false, status: 400 });

      const service = createService();

      await expect(
        service.follow({ addressOrUid: '0x1234', targets: ['0xaaaa'] }),
      ).rejects.toThrow(`${SocialServiceErrorMessage.FOLLOW_FAILED}: 400`);
    });

    it('throws when response schema is invalid', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ followed: 'not-an-array' }),
      });

      const service = createService();

      await expect(
        service.follow({ addressOrUid: '0x1234', targets: ['0xaaaa'] }),
      ).rejects.toThrow(SocialServiceErrorMessage.FOLLOW_INVALID_RESPONSE);
    });
  });

  describe('unfollow', () => {
    const mockUnfollowResponse = {
      unfollowed: [mockProfileSummary],
    };

    it('sends DELETE request with targets as query params', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve(mockUnfollowResponse),
      });

      const service = createService();
      const result = await service.unfollow({
        addressOrUid: '0x1234',
        targets: ['0xaaaa', '0xbbbb'],
      });

      expect(result).toStrictEqual(mockUnfollowResponse);
      const calledUrl = mockFetch.mock.calls[0][0] as string;
      expect(calledUrl).toContain('targets=0xaaaa');
      expect(calledUrl).toContain('targets=0xbbbb');
      expect(mockFetch.mock.calls[0][1]).toStrictEqual({
        method: 'DELETE',
        headers: { Authorization: `Bearer ${MOCK_TOKEN}` },
      });
    });

    it('throws HttpError on non-ok response', async () => {
      mockFetch.mockResolvedValue({ ok: false, status: 400 });

      const service = createService();

      await expect(
        service.unfollow({ addressOrUid: '0x1234', targets: ['0xaaaa'] }),
      ).rejects.toThrow(`${SocialServiceErrorMessage.UNFOLLOW_FAILED}: 400`);
    });

    it('throws when response schema is invalid', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ unfollowed: 'not-an-array' }),
      });

      const service = createService();

      await expect(
        service.unfollow({ addressOrUid: '0x1234', targets: ['0xaaaa'] }),
      ).rejects.toThrow(SocialServiceErrorMessage.UNFOLLOW_INVALID_RESPONSE);
    });
  });
});
