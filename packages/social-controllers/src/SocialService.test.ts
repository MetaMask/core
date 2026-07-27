import { Messenger, MOCK_ANY_NAMESPACE } from '@metamask/messenger';
import type {
  MockAnyNamespace,
  MessengerActions,
  MessengerEvents,
} from '@metamask/messenger';

import { SocialServiceErrorMessage, serviceName } from './social-constants.js';
import type { SocialServiceMessenger } from './SocialService.js';
import { SocialService } from './SocialService.js';

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
  positionId: 'position-1',
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

const mockPerpTrade = {
  direction: 'buy',
  intent: 'enter',
  classification: 'perp',
  perpPositionType: 'long',
  perpLeverage: 10,
  tokenAmount: 1.5,
  usdCost: 3000,
  timestamp: 1700000000,
  transactionHash:
    '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
};

const mockPerpPosition = {
  positionId: 'position-perp-1',
  tokenSymbol: 'BTC',
  tokenName: 'Bitcoin',
  tokenAddress: 'BTC',
  chain: 'hyperliquid',
  positionAmount: 2.5,
  boughtUsd: 112500,
  soldUsd: 0,
  realizedPnl: 0,
  costBasis: 112500,
  trades: [mockPerpTrade],
  lastTradeAt: 1700000000,
  perpPositionType: 'long',
  perpLeverage: 10,
  positionAmountWithLeverage: 25,
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

    it('accepts and returns the optional 7-day per-chain breakdown', async () => {
      const withPerChain7d = {
        ...mockProfileResponse,
        perChainBreakdown: {
          perChainPnl: { base: 30000, hyperliquid: 900000 },
          perChainRoi: { base: 2.5, hyperliquid: null },
          perChainVolume: { base: 100000, hyperliquid: 0 },
          perChainPnl7d: { base: 5000, hyperliquid: 120000 },
          perChainRoi7d: { base: 1.1, hyperliquid: null },
          perChainVolume7d: { base: 20000, hyperliquid: 0 },
        },
      };

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve(withPerChain7d),
      });

      const service = createService();
      const result = await service.fetchTraderProfile({
        addressOrId: '0x1234',
      });

      expect(result.perChainBreakdown).toStrictEqual(
        withPerChain7d.perChainBreakdown,
      );
    });

    it('accepts a profile without the optional 7-day per-chain breakdown', async () => {
      // The 30-day-only shape older social-api versions return.
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve(mockProfileResponse),
      });

      const service = createService();
      const result = await service.fetchTraderProfile({
        addressOrId: '0x1234',
      });

      expect(result.perChainBreakdown.perChainPnl7d).toBeUndefined();
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

    it('passes through perp metadata on positions and trades', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            positions: [mockPerpPosition],
            pagination: { hasMore: false },
          }),
      });

      const service = createService();
      const result = await service.fetchOpenPositions({
        addressOrId: '0x1234',
      });

      expect(result.positions[0]).toStrictEqual(mockPerpPosition);
      expect(result.positions[0].perpPositionType).toBe('long');
      expect(result.positions[0].perpLeverage).toBe(10);
      expect(result.positions[0].positionAmountWithLeverage).toBe(25);
      expect(result.positions[0].trades[0].classification).toBe('perp');
      expect(result.positions[0].trades[0].perpPositionType).toBe('long');
      expect(result.positions[0].trades[0].perpLeverage).toBe(10);
    });

    it('accepts null perp fields for spot positions', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            positions: [
              {
                ...mockPosition,
                perpPositionType: null,
                perpLeverage: null,
                positionAmountWithLeverage: null,
                trades: [
                  {
                    ...mockTrade,
                    classification: null,
                    perpPositionType: null,
                    perpLeverage: null,
                  },
                ],
              },
            ],
            pagination: { hasMore: false },
          }),
      });

      const service = createService();
      const result = await service.fetchOpenPositions({
        addressOrId: '0x1234',
      });

      expect(result.positions[0].perpPositionType).toBeNull();
      expect(result.positions[0].trades[0].classification).toBeNull();
    });

    it('rejects an invalid perpPositionType', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            positions: [{ ...mockPerpPosition, perpPositionType: 'sideways' }],
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

  describe('fetchPositionById', () => {
    it('fetches position from correct endpoint', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve(mockPosition),
      });

      const service = createService();
      const result = await service.fetchPositionById({
        positionId: 'position-1',
      });

      expect(result).toStrictEqual(mockPosition);
      expect(mockFetch).toHaveBeenCalledWith(
        `${V1_URL}/traders/position/position-1`,
        { headers: { Authorization: `Bearer ${MOCK_TOKEN}` } },
      );
    });

    it('encodes the positionId in the URL', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve(mockPosition),
      });

      const service = createService();
      await service.fetchPositionById({ positionId: 'pos/with/slashes' });

      expect(mockFetch).toHaveBeenCalledWith(
        `${V1_URL}/traders/position/pos%2Fwith%2Fslashes`,
        { headers: { Authorization: `Bearer ${MOCK_TOKEN}` } },
      );
    });

    it('throws HttpError on non-ok response', async () => {
      mockFetch.mockResolvedValue({ ok: false, status: 404 });

      const service = createService();

      await expect(
        service.fetchPositionById({ positionId: 'position-1' }),
      ).rejects.toThrow(
        `${SocialServiceErrorMessage.FETCH_POSITION_BY_ID_FAILED}: 404`,
      );
    });

    it('throws when response schema is invalid', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ positionId: 123 }),
      });

      const service = createService();

      await expect(
        service.fetchPositionById({ positionId: 'position-1' }),
      ).rejects.toThrow(
        SocialServiceErrorMessage.FETCH_POSITION_BY_ID_INVALID_RESPONSE,
      );
    });

    it('returns cached result on repeated calls with same positionId', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve(mockPosition),
      });

      const service = createService();
      await service.fetchPositionById({ positionId: 'position-1' });
      await service.fetchPositionById({ positionId: 'position-1' });

      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
  });

  describe('fetchFeed', () => {
    const mockFeedItem = {
      ...mockPosition,
      actor: mockProfileSummary,
      timestamp: 1700000000,
    };

    const mockFeedResponse = {
      items: [mockFeedItem],
      pagination: { olderCursor: 'older-cursor', newerCursor: 'newer-cursor' },
    };

    it('fetches the feed from the correct endpoint', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve(mockFeedResponse),
      });

      const service = createService();
      const result = await service.fetchFeed();

      expect(result).toStrictEqual(mockFeedResponse);
      expect(mockFetch).toHaveBeenCalledWith(`${V1_URL}/feed`, {
        headers: { Authorization: `Bearer ${MOCK_TOKEN}` },
      });
    });

    it('appends scope, chains, limit, and pagination cursors', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve(mockFeedResponse),
      });

      const service = createService();
      await service.fetchFeed({
        scope: 'leaderboard',
        chains: ['base', 'solana'],
        limit: 25,
        olderThan: 'older-cursor',
        newerThan: 'newer-cursor',
      });

      const calledUrl = mockFetch.mock.calls[0][0] as string;
      expect(calledUrl).toContain('scope=leaderboard');
      expect(calledUrl).toContain('chains=base');
      expect(calledUrl).toContain('chains=solana');
      expect(calledUrl).toContain('limit=25');
      expect(calledUrl).toContain('olderThan=older-cursor');
      expect(calledUrl).toContain('newerThan=newer-cursor');
    });

    it('validates a perp feed item', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            items: [
              { ...mockPerpPosition, actor: mockProfileSummary, timestamp: 1 },
            ],
            pagination: { olderCursor: null, newerCursor: null },
          }),
      });

      const service = createService();
      const result = await service.fetchFeed();

      expect(result.items).toHaveLength(1);
      expect(result.pagination).toStrictEqual({
        olderCursor: null,
        newerCursor: null,
      });
    });

    it('throws HttpError on non-ok response', async () => {
      mockFetch.mockResolvedValue({ ok: false, status: 500 });

      const service = createService();

      await expect(service.fetchFeed()).rejects.toThrow(
        `${SocialServiceErrorMessage.FETCH_FEED_FAILED}: 500`,
      );
    });

    it('throws when the feed item is missing its actor', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            items: [{ ...mockPosition, timestamp: 1700000000 }],
            pagination: { olderCursor: null, newerCursor: null },
          }),
      });

      const service = createService();

      await expect(service.fetchFeed()).rejects.toThrow(
        SocialServiceErrorMessage.FETCH_FEED_INVALID_RESPONSE,
      );
    });

    it('throws when the pagination shape is invalid', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            items: [mockFeedItem],
            pagination: { olderCursor: 123, newerCursor: null },
          }),
      });

      const service = createService();

      await expect(service.fetchFeed()).rejects.toThrow(
        SocialServiceErrorMessage.FETCH_FEED_INVALID_RESPONSE,
      );
    });
  });

  describe('fetchFollowing', () => {
    const mockFollowingResponse = {
      following: [mockProfileSummary],
      count: 1,
    };

    it('fetches following from the /users/me/following endpoint', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve(mockFollowingResponse),
      });

      const service = createService();
      const result = await service.fetchFollowing();

      expect(result).toStrictEqual(mockFollowingResponse);
      expect(mockFetch).toHaveBeenCalledWith(`${V1_URL}/users/me/following`, {
        headers: { Authorization: `Bearer ${MOCK_TOKEN}` },
      });
    });

    it('throws HttpError on non-ok response', async () => {
      mockFetch.mockResolvedValue({ ok: false, status: 500 });

      const service = createService();

      await expect(service.fetchFollowing()).rejects.toThrow(
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

      await expect(service.fetchFollowing()).rejects.toThrow(
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
      await service.fetchFollowing();
      await service.fetchFollowing();

      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });

  describe('follow', () => {
    const mockFollowResponse = {
      followed: [mockProfileSummary],
    };

    it('sends PUT request with targets in body to /users/me/follows', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve(mockFollowResponse),
      });

      const service = createService();
      const result = await service.follow({
        targets: ['0xaaaa', '0xbbbb'],
      });

      expect(result).toStrictEqual(mockFollowResponse);
      expect(mockFetch).toHaveBeenCalledWith(`${V1_URL}/users/me/follows`, {
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

      await expect(service.follow({ targets: ['0xaaaa'] })).rejects.toThrow(
        `${SocialServiceErrorMessage.FOLLOW_FAILED}: 400`,
      );
    });

    it('throws when response schema is invalid', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ followed: 'not-an-array' }),
      });

      const service = createService();

      await expect(service.follow({ targets: ['0xaaaa'] })).rejects.toThrow(
        SocialServiceErrorMessage.FOLLOW_INVALID_RESPONSE,
      );
    });
  });

  describe('unfollow', () => {
    const mockUnfollowResponse = {
      unfollowed: [mockProfileSummary],
    };

    it('sends DELETE request with targets as query params to /users/me/follows', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve(mockUnfollowResponse),
      });

      const service = createService();
      const result = await service.unfollow({
        targets: ['0xaaaa', '0xbbbb'],
      });

      expect(result).toStrictEqual(mockUnfollowResponse);
      const calledUrl = mockFetch.mock.calls[0][0] as string;
      expect(calledUrl).toContain(`${V1_URL}/users/me/follows`);
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

      await expect(service.unfollow({ targets: ['0xaaaa'] })).rejects.toThrow(
        `${SocialServiceErrorMessage.UNFOLLOW_FAILED}: 400`,
      );
    });

    it('throws when response schema is invalid', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ unfollowed: 'not-an-array' }),
      });

      const service = createService();

      await expect(service.unfollow({ targets: ['0xaaaa'] })).rejects.toThrow(
        SocialServiceErrorMessage.UNFOLLOW_INVALID_RESPONSE,
      );
    });
  });

  describe('optOutOfLeaderboard', () => {
    it('sends POST to /leaderboard/opt-out with the bearer token and resolves to void', async () => {
      mockFetch.mockResolvedValue({ ok: true, status: 204 });

      const service = createService();
      const result = await service.optOutOfLeaderboard();

      expect(result).toBeUndefined();
      expect(mockFetch).toHaveBeenCalledWith(`${V1_URL}/leaderboard/opt-out`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${MOCK_TOKEN}` },
      });
    });

    it('throws HttpError on non-ok response', async () => {
      mockFetch.mockResolvedValue({ ok: false, status: 401 });

      const service = createService();

      await expect(service.optOutOfLeaderboard()).rejects.toThrow(
        `${SocialServiceErrorMessage.LEADERBOARD_OPT_OUT_FAILED}: 401`,
      );
    });
  });

  describe('optInToLeaderboard', () => {
    it('sends POST to /leaderboard/opt-in with the bearer token and resolves to void', async () => {
      mockFetch.mockResolvedValue({ ok: true, status: 204 });

      const service = createService();
      const result = await service.optInToLeaderboard();

      expect(result).toBeUndefined();
      expect(mockFetch).toHaveBeenCalledWith(`${V1_URL}/leaderboard/opt-in`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${MOCK_TOKEN}` },
      });
    });

    it('throws HttpError on non-ok response', async () => {
      mockFetch.mockResolvedValue({ ok: false, status: 500 });

      const service = createService();

      await expect(service.optInToLeaderboard()).rejects.toThrow(
        `${SocialServiceErrorMessage.LEADERBOARD_OPT_IN_FAILED}: 500`,
      );
    });
  });
});
