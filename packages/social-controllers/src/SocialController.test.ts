import { Messenger } from '@metamask/messenger';

import type { SocialControllerMessenger } from './SocialController';
import {
  SocialController,
  getDefaultSocialControllerState,
} from './SocialController';
import { controllerName } from './social-constants';
import type { SocialDataService } from './social-types';

const mockProfileSummary = {
  profileId: '550e8400-e29b-41d4-a716-446655440000',
  address: '0x1111111111111111111111111111111111111111',
  name: 'TraderAlice',
  imageUrl: 'https://example.com/avatar.png',
};

const mockProfileSummaryB = {
  profileId: '660e8400-e29b-41d4-a716-446655440001',
  address: '0x2222222222222222222222222222222222222222',
  name: 'TraderBob',
};

const mockLeaderboardEntry = {
  rank: 1,
  addresses: ['0x1111111111111111111111111111111111111111'],
  profileId: '550e8400-e29b-41d4-a716-446655440000',
  name: 'TraderAlice',
  pnl30d: 50000,
  pnlPerChain: { base: 30000 },
  followerCount: 100,
  socialHandles: { twitter: '@traderalice' },
};

function createMockService(
  overrides?: Partial<SocialDataService>,
): SocialDataService {
  return {
    fetchLeaderboard: jest.fn().mockResolvedValue({
      traders: [mockLeaderboardEntry],
    }),
    fetchTraderProfile: jest.fn().mockResolvedValue({}),
    fetchOpenPositions: jest.fn().mockResolvedValue({
      positions: [],
      pagination: { hasMore: false },
    }),
    fetchClosedPositions: jest.fn().mockResolvedValue({
      positions: [],
      pagination: { hasMore: false },
    }),
    fetchFollowers: jest.fn().mockResolvedValue({
      followers: [],
      count: 0,
    }),
    fetchFollowing: jest.fn().mockResolvedValue({
      following: [mockProfileSummary],
      count: 1,
    }),
    follow: jest.fn().mockResolvedValue({
      followed: [mockProfileSummary],
    }),
    unfollow: jest.fn().mockResolvedValue({
      unfollowed: [mockProfileSummary],
    }),
    ...overrides,
  };
}

function createMessenger(): SocialControllerMessenger {
  return new Messenger({
    namespace: controllerName,
  }) as SocialControllerMessenger;
}

function createController(
  options: {
    messenger?: SocialControllerMessenger;
    socialService?: SocialDataService;
    state?: Partial<ReturnType<typeof getDefaultSocialControllerState>>;
  } = {},
) {
  const messenger = options.messenger ?? createMessenger();
  const socialService = options.socialService ?? createMockService();
  const controller = new SocialController({
    messenger,
    socialService,
    state: options.state,
  });
  return { controller, messenger, socialService };
}

describe('SocialController', () => {
  describe('getDefaultSocialControllerState', () => {
    it('returns empty default state', () => {
      expect(getDefaultSocialControllerState()).toStrictEqual({
        leaderboardEntries: [],
        followingAddresses: [],
      });
    });
  });

  describe('constructor', () => {
    it('initializes with default state', () => {
      const { controller } = createController();

      expect(controller.state).toStrictEqual({
        leaderboardEntries: [],
        followingAddresses: [],
      });
    });

    it('merges partial initial state with defaults', () => {
      const { controller } = createController({
        state: { followingAddresses: ['0xaaaa'] },
      });

      expect(controller.state).toStrictEqual({
        leaderboardEntries: [],
        followingAddresses: ['0xaaaa'],
      });
    });
  });

  describe('fetchLeaderboard', () => {
    it('fetches leaderboard and persists entries to state', async () => {
      const { controller, socialService } = createController();

      const result = await controller.fetchLeaderboard();

      expect(socialService.fetchLeaderboard).toHaveBeenCalledWith(undefined);
      expect(result.traders).toStrictEqual([mockLeaderboardEntry]);
      expect(controller.state.leaderboardEntries).toStrictEqual([
        mockLeaderboardEntry,
      ]);
    });

    it('passes options to the service', async () => {
      const { controller, socialService } = createController();

      await controller.fetchLeaderboard({ sort: 'roi', limit: 10 });

      expect(socialService.fetchLeaderboard).toHaveBeenCalledWith({
        sort: 'roi',
        limit: 10,
      });
    });

    it('overwrites previous leaderboard entries', async () => {
      const secondEntry = { ...mockLeaderboardEntry, rank: 2, name: 'Bob' };
      const socialService = createMockService({
        fetchLeaderboard: jest
          .fn()
          .mockResolvedValueOnce({ traders: [mockLeaderboardEntry] })
          .mockResolvedValueOnce({ traders: [secondEntry] }),
      });
      const { controller } = createController({ socialService });

      await controller.fetchLeaderboard();
      expect(controller.state.leaderboardEntries).toStrictEqual([
        mockLeaderboardEntry,
      ]);

      await controller.fetchLeaderboard();
      expect(controller.state.leaderboardEntries).toStrictEqual([secondEntry]);
    });

    it('is callable via messenger action', async () => {
      const { messenger } = createController();

      const result = await messenger.call(
        'SocialController:fetchLeaderboard',
        undefined,
      );

      expect(result.traders).toStrictEqual([mockLeaderboardEntry]);
    });
  });

  describe('followTrader', () => {
    it('calls service and appends new addresses to state', async () => {
      const { controller, socialService } = createController();

      const result = await controller.followTrader({
        addressOrUid: '0xuser',
        targets: ['0x1111111111111111111111111111111111111111'],
      });

      expect(socialService.follow).toHaveBeenCalledWith({
        addressOrUid: '0xuser',
        targets: ['0x1111111111111111111111111111111111111111'],
      });
      expect(result.followed).toStrictEqual([mockProfileSummary]);
      expect(controller.state.followingAddresses).toStrictEqual([
        '0x1111111111111111111111111111111111111111',
      ]);
    });

    it('deduplicates addresses when following someone already followed', async () => {
      const { controller } = createController({
        state: {
          followingAddresses: [
            '0x1111111111111111111111111111111111111111',
          ],
        },
      });

      await controller.followTrader({
        addressOrUid: '0xuser',
        targets: ['0x1111111111111111111111111111111111111111'],
      });

      expect(controller.state.followingAddresses).toStrictEqual([
        '0x1111111111111111111111111111111111111111',
      ]);
    });

    it('appends multiple new addresses', async () => {
      const socialService = createMockService({
        follow: jest.fn().mockResolvedValue({
          followed: [mockProfileSummary, mockProfileSummaryB],
        }),
      });
      const { controller } = createController({ socialService });

      await controller.followTrader({
        addressOrUid: '0xuser',
        targets: [
          '0x1111111111111111111111111111111111111111',
          '0x2222222222222222222222222222222222222222',
        ],
      });

      expect(controller.state.followingAddresses).toStrictEqual([
        '0x1111111111111111111111111111111111111111',
        '0x2222222222222222222222222222222222222222',
      ]);
    });

    it('is callable via messenger action', async () => {
      const { messenger } = createController();

      const result = await messenger.call(
        'SocialController:followTrader',
        { addressOrUid: '0xuser', targets: ['0xaaaa'] },
      );

      expect(result.followed).toStrictEqual([mockProfileSummary]);
    });
  });

  describe('unfollowTrader', () => {
    it('calls service and removes addresses from state', async () => {
      const { controller, socialService } = createController({
        state: {
          followingAddresses: [
            '0x1111111111111111111111111111111111111111',
            '0x2222222222222222222222222222222222222222',
          ],
        },
      });

      const result = await controller.unfollowTrader({
        addressOrUid: '0xuser',
        targets: ['0x1111111111111111111111111111111111111111'],
      });

      expect(socialService.unfollow).toHaveBeenCalledWith({
        addressOrUid: '0xuser',
        targets: ['0x1111111111111111111111111111111111111111'],
      });
      expect(result.unfollowed).toStrictEqual([mockProfileSummary]);
      expect(controller.state.followingAddresses).toStrictEqual([
        '0x2222222222222222222222222222222222222222',
      ]);
    });

    it('handles unfollowing an address not in state gracefully', async () => {
      const { controller } = createController({
        state: { followingAddresses: [] },
      });

      await controller.unfollowTrader({
        addressOrUid: '0xuser',
        targets: ['0x1111111111111111111111111111111111111111'],
      });

      expect(controller.state.followingAddresses).toStrictEqual([]);
    });

    it('is callable via messenger action', async () => {
      const { messenger } = createController();

      const result = await messenger.call(
        'SocialController:unfollowTrader',
        { addressOrUid: '0xuser', targets: ['0xaaaa'] },
      );

      expect(result.unfollowed).toStrictEqual([mockProfileSummary]);
    });
  });

  describe('fetchFollowing', () => {
    it('calls service and replaces followingAddresses in state', async () => {
      const { controller, socialService } = createController({
        state: {
          followingAddresses: ['0xold'],
        },
      });

      const result = await controller.fetchFollowing({
        addressOrUid: '0xuser',
      });

      expect(socialService.fetchFollowing).toHaveBeenCalledWith({
        addressOrUid: '0xuser',
      });
      expect(result.following).toStrictEqual([mockProfileSummary]);
      expect(controller.state.followingAddresses).toStrictEqual([
        '0x1111111111111111111111111111111111111111',
      ]);
    });

    it('clears followingAddresses when response is empty', async () => {
      const socialService = createMockService({
        fetchFollowing: jest.fn().mockResolvedValue({
          following: [],
          count: 0,
        }),
      });
      const { controller } = createController({
        socialService,
        state: { followingAddresses: ['0xold'] },
      });

      await controller.fetchFollowing({ addressOrUid: '0xuser' });

      expect(controller.state.followingAddresses).toStrictEqual([]);
    });

    it('is callable via messenger action', async () => {
      const { messenger } = createController();

      const result = await messenger.call(
        'SocialController:fetchFollowing',
        { addressOrUid: '0xuser' },
      );

      expect(result.following).toStrictEqual([mockProfileSummary]);
    });
  });

  describe('error propagation', () => {
    it('propagates service errors from fetchLeaderboard', async () => {
      const socialService = createMockService({
        fetchLeaderboard: jest
          .fn()
          .mockRejectedValue(new Error('network error')),
      });
      const { controller } = createController({ socialService });

      await expect(controller.fetchLeaderboard()).rejects.toThrow(
        'network error',
      );
      expect(controller.state.leaderboardEntries).toStrictEqual([]);
    });

    it('propagates service errors from followTrader', async () => {
      const socialService = createMockService({
        follow: jest.fn().mockRejectedValue(new Error('follow failed')),
      });
      const { controller } = createController({ socialService });

      await expect(
        controller.followTrader({
          addressOrUid: '0xuser',
          targets: ['0xaaaa'],
        }),
      ).rejects.toThrow('follow failed');
      expect(controller.state.followingAddresses).toStrictEqual([]);
    });

    it('propagates service errors from unfollowTrader', async () => {
      const socialService = createMockService({
        unfollow: jest.fn().mockRejectedValue(new Error('unfollow failed')),
      });
      const { controller } = createController({
        socialService,
        state: { followingAddresses: ['0xaaaa'] },
      });

      await expect(
        controller.unfollowTrader({
          addressOrUid: '0xuser',
          targets: ['0xaaaa'],
        }),
      ).rejects.toThrow('unfollow failed');
      expect(controller.state.followingAddresses).toStrictEqual(['0xaaaa']);
    });

    it('propagates service errors from fetchFollowing', async () => {
      const socialService = createMockService({
        fetchFollowing: jest
          .fn()
          .mockRejectedValue(new Error('fetch following failed')),
      });
      const { controller } = createController({
        socialService,
        state: { followingAddresses: ['0xold'] },
      });

      await expect(
        controller.fetchFollowing({ addressOrUid: '0xuser' }),
      ).rejects.toThrow('fetch following failed');
      expect(controller.state.followingAddresses).toStrictEqual(['0xold']);
    });
  });
});
