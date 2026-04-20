import { Messenger, MOCK_ANY_NAMESPACE } from '@metamask/messenger';
import type {
  MockAnyNamespace,
  MessengerActions,
  MessengerEvents,
} from '@metamask/messenger';

import { controllerName } from './social-constants';
import type { SocialControllerState } from './social-types';
import type { SocialControllerMessenger } from './SocialController';
import {
  SocialController,
  getDefaultSocialControllerState,
} from './SocialController';

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

type RootMessenger = Messenger<
  MockAnyNamespace,
  MessengerActions<SocialControllerMessenger>,
  MessengerEvents<SocialControllerMessenger>
>;

function getRootMessenger(): RootMessenger {
  return new Messenger({ namespace: MOCK_ANY_NAMESPACE });
}

function getMessenger(rootMessenger: RootMessenger): SocialControllerMessenger {
  const messenger: SocialControllerMessenger = new Messenger({
    namespace: controllerName,
    parent: rootMessenger,
  });
  rootMessenger.delegate({
    actions: [
      'SocialService:fetchLeaderboard',
      'SocialService:follow',
      'SocialService:unfollow',
      'SocialService:fetchFollowing',
    ],
    events: [],
    messenger,
  });
  return messenger;
}

function createController(
  options: {
    rootMessenger?: RootMessenger;
    state?: Partial<SocialControllerState>;
  } = {},
): {
  controller: SocialController;
  rootMessenger: RootMessenger;
  messenger: SocialControllerMessenger;
} {
  const rootMessenger = options.rootMessenger ?? getRootMessenger();
  const messenger = getMessenger(rootMessenger);
  const controller = new SocialController({
    messenger,
    state: options.state,
  });
  return { controller, rootMessenger, messenger };
}

function mockServiceAction(
  rootMessenger: RootMessenger,
  action: string,
  implementation: jest.Mock,
): void {
  rootMessenger.registerActionHandler(action as never, implementation as never);
}

describe('SocialController', () => {
  describe('getDefaultSocialControllerState', () => {
    it('returns empty default state', () => {
      expect(getDefaultSocialControllerState()).toStrictEqual({
        leaderboardEntries: [],
        followingAddresses: [],
        followingProfileIds: [],
      });
    });
  });

  describe('constructor', () => {
    it('initializes with default state', () => {
      const { controller } = createController();

      expect(controller.state).toStrictEqual({
        leaderboardEntries: [],
        followingAddresses: [],
        followingProfileIds: [],
      });
    });

    it('merges partial initial state with defaults', () => {
      const { controller } = createController({
        state: { followingAddresses: ['0xaaaa'] },
      });

      expect(controller.state).toStrictEqual({
        leaderboardEntries: [],
        followingAddresses: ['0xaaaa'],
        followingProfileIds: [],
      });
    });

    it('merges partial initial followingProfileIds with defaults', () => {
      const { controller } = createController({
        state: {
          followingProfileIds: ['550e8400-e29b-41d4-a716-446655440000'],
        },
      });

      expect(controller.state).toStrictEqual({
        leaderboardEntries: [],
        followingAddresses: [],
        followingProfileIds: ['550e8400-e29b-41d4-a716-446655440000'],
      });
    });
  });

  describe('updateLeaderboard', () => {
    it('fetches leaderboard via messenger and persists entries to state', async () => {
      const rootMessenger = getRootMessenger();
      const fetchLeaderboard = jest.fn().mockResolvedValue({
        traders: [mockLeaderboardEntry],
      });
      mockServiceAction(
        rootMessenger,
        'SocialService:fetchLeaderboard',
        fetchLeaderboard,
      );

      const { controller } = createController({ rootMessenger });
      const result = await controller.updateLeaderboard();

      expect(fetchLeaderboard).toHaveBeenCalledWith(undefined);
      expect(result.traders).toStrictEqual([mockLeaderboardEntry]);
      expect(controller.state.leaderboardEntries).toStrictEqual([
        mockLeaderboardEntry,
      ]);
    });

    it('passes options to the service', async () => {
      const rootMessenger = getRootMessenger();
      const fetchLeaderboard = jest.fn().mockResolvedValue({
        traders: [mockLeaderboardEntry],
      });
      mockServiceAction(
        rootMessenger,
        'SocialService:fetchLeaderboard',
        fetchLeaderboard,
      );

      const { controller } = createController({ rootMessenger });
      await controller.updateLeaderboard({ sort: 'roi', limit: 10 });

      expect(fetchLeaderboard).toHaveBeenCalledWith({
        sort: 'roi',
        limit: 10,
      });
    });

    it('overwrites previous leaderboard entries', async () => {
      const rootMessenger = getRootMessenger();
      const secondEntry = { ...mockLeaderboardEntry, rank: 2, name: 'Bob' };
      const fetchLeaderboard = jest
        .fn()
        .mockResolvedValueOnce({ traders: [mockLeaderboardEntry] })
        .mockResolvedValueOnce({ traders: [secondEntry] });
      mockServiceAction(
        rootMessenger,
        'SocialService:fetchLeaderboard',
        fetchLeaderboard,
      );

      const { controller } = createController({ rootMessenger });

      await controller.updateLeaderboard();
      expect(controller.state.leaderboardEntries).toStrictEqual([
        mockLeaderboardEntry,
      ]);

      await controller.updateLeaderboard();
      expect(controller.state.leaderboardEntries).toStrictEqual([secondEntry]);
    });

    it('is callable via messenger action', async () => {
      const rootMessenger = getRootMessenger();
      mockServiceAction(
        rootMessenger,
        'SocialService:fetchLeaderboard',
        jest.fn().mockResolvedValue({ traders: [mockLeaderboardEntry] }),
      );

      const { messenger } = createController({ rootMessenger });

      const result = await messenger.call(
        'SocialController:updateLeaderboard',
        undefined,
      );

      expect(result.traders).toStrictEqual([mockLeaderboardEntry]);
    });
  });

  describe('followTrader', () => {
    it('calls service via messenger and appends new addresses and profile IDs to state', async () => {
      const rootMessenger = getRootMessenger();
      const follow = jest
        .fn()
        .mockResolvedValue({ followed: [mockProfileSummary] });
      mockServiceAction(rootMessenger, 'SocialService:follow', follow);

      const { controller } = createController({ rootMessenger });

      const result = await controller.followTrader({
        addressOrUid: '0xuser',
        targets: ['0x1111111111111111111111111111111111111111'],
      });

      expect(follow).toHaveBeenCalledWith({
        addressOrUid: '0xuser',
        targets: ['0x1111111111111111111111111111111111111111'],
      });
      expect(result.followed).toStrictEqual([mockProfileSummary]);
      expect(controller.state.followingAddresses).toStrictEqual([
        '0x1111111111111111111111111111111111111111',
      ]);
      expect(controller.state.followingProfileIds).toStrictEqual([
        '550e8400-e29b-41d4-a716-446655440000',
      ]);
    });

    it('appends multiple new addresses and profile IDs', async () => {
      const rootMessenger = getRootMessenger();
      mockServiceAction(
        rootMessenger,
        'SocialService:follow',
        jest.fn().mockResolvedValue({
          followed: [mockProfileSummary, mockProfileSummaryB],
        }),
      );

      const { controller } = createController({ rootMessenger });

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
      expect(controller.state.followingProfileIds).toStrictEqual([
        '550e8400-e29b-41d4-a716-446655440000',
        '660e8400-e29b-41d4-a716-446655440001',
      ]);
    });

    it('deduplicates addresses and profile IDs within the same batch', async () => {
      const rootMessenger = getRootMessenger();
      mockServiceAction(
        rootMessenger,
        'SocialService:follow',
        jest.fn().mockResolvedValue({
          followed: [mockProfileSummary, mockProfileSummary],
        }),
      );

      const { controller } = createController({ rootMessenger });

      await controller.followTrader({
        addressOrUid: '0xuser',
        targets: ['0x1111111111111111111111111111111111111111'],
      });

      expect(controller.state.followingAddresses).toStrictEqual([
        '0x1111111111111111111111111111111111111111',
      ]);
      expect(controller.state.followingProfileIds).toStrictEqual([
        '550e8400-e29b-41d4-a716-446655440000',
      ]);
    });

    it('does not duplicate existing addresses or profile IDs across calls', async () => {
      const rootMessenger = getRootMessenger();
      mockServiceAction(
        rootMessenger,
        'SocialService:follow',
        jest.fn().mockResolvedValue({ followed: [mockProfileSummary] }),
      );

      const { controller } = createController({ rootMessenger });

      await controller.followTrader({
        addressOrUid: '0xuser',
        targets: ['0x1111111111111111111111111111111111111111'],
      });
      await controller.followTrader({
        addressOrUid: '0xuser',
        targets: ['0x1111111111111111111111111111111111111111'],
      });

      expect(controller.state.followingAddresses).toStrictEqual([
        '0x1111111111111111111111111111111111111111',
      ]);
      expect(controller.state.followingProfileIds).toStrictEqual([
        '550e8400-e29b-41d4-a716-446655440000',
      ]);
    });

    it('is callable via messenger action', async () => {
      const rootMessenger = getRootMessenger();
      mockServiceAction(
        rootMessenger,
        'SocialService:follow',
        jest.fn().mockResolvedValue({ followed: [mockProfileSummary] }),
      );

      const { messenger } = createController({ rootMessenger });

      const result = await messenger.call('SocialController:followTrader', {
        addressOrUid: '0xuser',
        targets: ['0xaaaa'],
      });

      expect(result.followed).toStrictEqual([mockProfileSummary]);
    });
  });

  describe('unfollowTrader', () => {
    it('calls service via messenger and removes addresses and profile IDs from state', async () => {
      const rootMessenger = getRootMessenger();
      const unfollow = jest
        .fn()
        .mockResolvedValue({ unfollowed: [mockProfileSummary] });
      mockServiceAction(rootMessenger, 'SocialService:unfollow', unfollow);

      const { controller } = createController({
        rootMessenger,
        state: {
          followingAddresses: [
            '0x1111111111111111111111111111111111111111',
            '0x2222222222222222222222222222222222222222',
          ],
          followingProfileIds: [
            '550e8400-e29b-41d4-a716-446655440000',
            '660e8400-e29b-41d4-a716-446655440001',
          ],
        },
      });

      const result = await controller.unfollowTrader({
        addressOrUid: '0xuser',
        targets: ['0x1111111111111111111111111111111111111111'],
      });

      expect(unfollow).toHaveBeenCalledWith({
        addressOrUid: '0xuser',
        targets: ['0x1111111111111111111111111111111111111111'],
      });
      expect(result.unfollowed).toStrictEqual([mockProfileSummary]);
      expect(controller.state.followingAddresses).toStrictEqual([
        '0x2222222222222222222222222222222222222222',
      ]);
      expect(controller.state.followingProfileIds).toStrictEqual([
        '660e8400-e29b-41d4-a716-446655440001',
      ]);
    });

    it('handles unfollowing an address not in state gracefully', async () => {
      const rootMessenger = getRootMessenger();
      mockServiceAction(
        rootMessenger,
        'SocialService:unfollow',
        jest.fn().mockResolvedValue({ unfollowed: [mockProfileSummary] }),
      );

      const { controller } = createController({
        rootMessenger,
        state: { followingAddresses: [], followingProfileIds: [] },
      });

      await controller.unfollowTrader({
        addressOrUid: '0xuser',
        targets: ['0x1111111111111111111111111111111111111111'],
      });

      expect(controller.state.followingAddresses).toStrictEqual([]);
      expect(controller.state.followingProfileIds).toStrictEqual([]);
    });

    it('is callable via messenger action', async () => {
      const rootMessenger = getRootMessenger();
      mockServiceAction(
        rootMessenger,
        'SocialService:unfollow',
        jest.fn().mockResolvedValue({ unfollowed: [mockProfileSummary] }),
      );

      const { messenger } = createController({ rootMessenger });

      const result = await messenger.call('SocialController:unfollowTrader', {
        addressOrUid: '0xuser',
        targets: ['0xaaaa'],
      });

      expect(result.unfollowed).toStrictEqual([mockProfileSummary]);
    });
  });

  describe('updateFollowing', () => {
    it('calls service via messenger and replaces followingAddresses and followingProfileIds in state', async () => {
      const rootMessenger = getRootMessenger();
      const fetchFollowing = jest.fn().mockResolvedValue({
        following: [mockProfileSummary],
        count: 1,
      });
      mockServiceAction(
        rootMessenger,
        'SocialService:fetchFollowing',
        fetchFollowing,
      );

      const { controller } = createController({
        rootMessenger,
        state: {
          followingAddresses: ['0xold'],
          followingProfileIds: ['old-profile-id'],
        },
      });

      const result = await controller.updateFollowing({
        addressOrUid: '0xuser',
      });

      expect(fetchFollowing).toHaveBeenCalledWith({
        addressOrUid: '0xuser',
      });
      expect(result.following).toStrictEqual([mockProfileSummary]);
      expect(controller.state.followingAddresses).toStrictEqual([
        '0x1111111111111111111111111111111111111111',
      ]);
      expect(controller.state.followingProfileIds).toStrictEqual([
        '550e8400-e29b-41d4-a716-446655440000',
      ]);
    });

    it('clears followingAddresses and followingProfileIds when response is empty', async () => {
      const rootMessenger = getRootMessenger();
      mockServiceAction(
        rootMessenger,
        'SocialService:fetchFollowing',
        jest.fn().mockResolvedValue({ following: [], count: 0 }),
      );

      const { controller } = createController({
        rootMessenger,
        state: {
          followingAddresses: ['0xold'],
          followingProfileIds: ['old-profile-id'],
        },
      });

      await controller.updateFollowing({ addressOrUid: '0xuser' });

      expect(controller.state.followingAddresses).toStrictEqual([]);
      expect(controller.state.followingProfileIds).toStrictEqual([]);
    });

    it('is callable via messenger action', async () => {
      const rootMessenger = getRootMessenger();
      mockServiceAction(
        rootMessenger,
        'SocialService:fetchFollowing',
        jest.fn().mockResolvedValue({
          following: [mockProfileSummary],
          count: 1,
        }),
      );

      const { messenger } = createController({ rootMessenger });

      const result = await messenger.call('SocialController:updateFollowing', {
        addressOrUid: '0xuser',
      });

      expect(result.following).toStrictEqual([mockProfileSummary]);
    });
  });

  describe('error propagation', () => {
    it('propagates service errors from updateLeaderboard', async () => {
      const rootMessenger = getRootMessenger();
      mockServiceAction(
        rootMessenger,
        'SocialService:fetchLeaderboard',
        jest.fn().mockRejectedValue(new Error('network error')),
      );

      const { controller } = createController({ rootMessenger });

      await expect(controller.updateLeaderboard()).rejects.toThrow(
        'network error',
      );
      expect(controller.state.leaderboardEntries).toStrictEqual([]);
    });

    it('propagates service errors from followTrader', async () => {
      const rootMessenger = getRootMessenger();
      mockServiceAction(
        rootMessenger,
        'SocialService:follow',
        jest.fn().mockRejectedValue(new Error('follow failed')),
      );

      const { controller } = createController({ rootMessenger });

      await expect(
        controller.followTrader({
          addressOrUid: '0xuser',
          targets: ['0xaaaa'],
        }),
      ).rejects.toThrow('follow failed');
      expect(controller.state.followingAddresses).toStrictEqual([]);
    });

    it('propagates service errors from unfollowTrader', async () => {
      const rootMessenger = getRootMessenger();
      mockServiceAction(
        rootMessenger,
        'SocialService:unfollow',
        jest.fn().mockRejectedValue(new Error('unfollow failed')),
      );

      const { controller } = createController({
        rootMessenger,
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

    it('propagates service errors from updateFollowing', async () => {
      const rootMessenger = getRootMessenger();
      mockServiceAction(
        rootMessenger,
        'SocialService:fetchFollowing',
        jest.fn().mockRejectedValue(new Error('fetch following failed')),
      );

      const { controller } = createController({
        rootMessenger,
        state: { followingAddresses: ['0xold'] },
      });

      await expect(
        controller.updateFollowing({ addressOrUid: '0xuser' }),
      ).rejects.toThrow('fetch following failed');
      expect(controller.state.followingAddresses).toStrictEqual(['0xold']);
    });
  });
});
