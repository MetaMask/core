import { RewardsIntegrationService } from '../../../src/services/RewardsIntegrationService.js';
import type { PerpsPlatformDependencies } from '../../../src/types/index.js';
/* eslint-disable */
import {
  createMockEvmAccount,
  createMockInfrastructure,
  createMockMessenger,
} from '../../helpers/serviceMocks.js';

describe('RewardsIntegrationService', () => {
  let mockDeps: jest.Mocked<PerpsPlatformDependencies>;
  let mockMessenger: ReturnType<typeof createMockMessenger>;
  let service: RewardsIntegrationService;
  const mockEvmAccount = createMockEvmAccount();

  /**
   * Helper to set up mockMessenger.call with standard defaults,
   * plus optional overrides for specific actions.
   */
  const setupMessengerDefaults = (overrides: Record<string, unknown> = {}) => {
    (mockMessenger.call as jest.Mock).mockImplementation(
      (action: string, ...args: unknown[]) => {
        if (action in overrides) {
          const val = overrides[action];
          return typeof val === 'function'
            ? (val as (...a: unknown[]) => unknown)(...args)
            : val;
        }
        if (
          action === 'AccountTreeController:getAccountsFromSelectedAccountGroup'
        ) {
          return [mockEvmAccount];
        }
        if (action === 'NetworkController:getState') {
          return { selectedNetworkClientId: 'mainnet' };
        }
        if (action === 'NetworkController:getNetworkClientById') {
          return { configuration: { chainId: '0x1' } };
        }
        return undefined;
      },
    );
  };

  beforeEach(() => {
    mockDeps = createMockInfrastructure();
    mockMessenger = createMockMessenger();
    service = new RewardsIntegrationService(mockDeps, mockMessenger);

    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  describe('calculateUserFeeDiscount', () => {
    it('calculates fee discount successfully with valid discount', async () => {
      const mockDiscountBips = 6500; // 65%

      setupMessengerDefaults();
      (
        mockDeps.rewards.getPerpsDiscountForAccount as jest.Mock
      ).mockResolvedValue(mockDiscountBips);

      const result = await service.calculateUserFeeDiscount();

      expect(result).toBe(6500);
      expect(mockDeps.rewards.getPerpsDiscountForAccount).toHaveBeenCalledWith(
        expect.stringMatching(/^eip155:1:0x/),
        10,
      );
      expect(mockDeps.debugLogger.log).toHaveBeenCalledWith(
        'RewardsIntegrationService: Fee discount calculated',
        expect.objectContaining({
          discountBips: 6500,
          discountPercentage: 65,
        }),
      );
    });

    it('returns 0 when no discount available', async () => {
      setupMessengerDefaults();
      (
        mockDeps.rewards.getPerpsDiscountForAccount as jest.Mock
      ).mockResolvedValue(0);

      const result = await service.calculateUserFeeDiscount();

      expect(result).toBe(0);
    });

    it('returns undefined when rewards subscription state has not hydrated yet', async () => {
      setupMessengerDefaults();
      (
        mockDeps.rewards.getPerpsDiscountForAccount as jest.Mock
      ).mockResolvedValue(null);

      const result = await service.calculateUserFeeDiscount();

      expect(result).toBeUndefined();
      expect(mockDeps.debugLogger.log).toHaveBeenCalledWith(
        'RewardsIntegrationService: Fee discount unavailable (subscription state not hydrated)',
        expect.objectContaining({
          caipAccountId: expect.any(String),
        }),
      );
    });

    it('returns undefined when no EVM account found', async () => {
      setupMessengerDefaults({
        'AccountTreeController:getAccountsFromSelectedAccountGroup': [],
      });

      const result = await service.calculateUserFeeDiscount();

      expect(result).toBeUndefined();
      expect(mockDeps.debugLogger.log).toHaveBeenCalledWith(
        'RewardsIntegrationService: No EVM account found for fee discount',
      );
      expect(
        mockDeps.rewards.getPerpsDiscountForAccount,
      ).not.toHaveBeenCalled();
    });

    it('returns undefined when chain ID not found', async () => {
      setupMessengerDefaults({
        'NetworkController:getNetworkClientById': () => {
          throw new Error('Network client not found');
        },
      });

      const result = await service.calculateUserFeeDiscount();

      expect(result).toBeUndefined();
      expect(
        mockDeps.rewards.getPerpsDiscountForAccount,
      ).not.toHaveBeenCalled();
    });

    it('returns undefined when getFeeDiscount throws error', async () => {
      const mockError = new Error('Rewards API error');

      setupMessengerDefaults();
      (
        mockDeps.rewards.getPerpsDiscountForAccount as jest.Mock
      ).mockRejectedValue(mockError);

      const result = await service.calculateUserFeeDiscount();

      expect(result).toBeUndefined();
      expect(mockDeps.logger.error).toHaveBeenCalledWith(
        mockError,
        expect.objectContaining({
          context: expect.objectContaining({
            name: 'RewardsIntegrationService.calculateUserFeeDiscount',
          }),
        }),
      );
    });

    it('returns undefined when NetworkController throws error', async () => {
      const mockError = new Error('Network error');

      setupMessengerDefaults({
        'NetworkController:getState': () => {
          throw mockError;
        },
      });

      const result = await service.calculateUserFeeDiscount();

      expect(result).toBeUndefined();
      expect(mockDeps.logger.error).toHaveBeenCalled();
    });

    it('handles different chain IDs correctly', async () => {
      const chains = [
        { chainId: '0x1', name: 'Mainnet' },
        { chainId: '0x89', name: 'Polygon' },
        { chainId: '0xa4b1', name: 'Arbitrum' },
      ];

      for (const chain of chains) {
        jest.clearAllMocks();
        mockDeps = createMockInfrastructure();
        mockMessenger = createMockMessenger();
        service = new RewardsIntegrationService(mockDeps, mockMessenger);

        (mockMessenger.call as jest.Mock).mockImplementation(
          (action: string) => {
            if (
              action ===
              'AccountTreeController:getAccountsFromSelectedAccountGroup'
            ) {
              return [mockEvmAccount];
            }
            if (action === 'NetworkController:getState') {
              return { selectedNetworkClientId: chain.name.toLowerCase() };
            }
            if (action === 'NetworkController:getNetworkClientById') {
              return { configuration: { chainId: chain.chainId } };
            }
            return undefined;
          },
        );
        (
          mockDeps.rewards.getPerpsDiscountForAccount as jest.Mock
        ).mockResolvedValue(5000);

        const result = await service.calculateUserFeeDiscount();

        expect(result).toBe(5000);
      }
    });

    it('calculates discount percentage correctly in logs', async () => {
      const testCases = [
        { bips: 6500, percentage: 65 },
        { bips: 5000, percentage: 50 },
        { bips: 2500, percentage: 25 },
        { bips: 1000, percentage: 10 },
        { bips: 0, percentage: 0 },
      ];

      for (const testCase of testCases) {
        jest.clearAllMocks();

        setupMessengerDefaults();
        (
          mockDeps.rewards.getPerpsDiscountForAccount as jest.Mock
        ).mockResolvedValue(testCase.bips);

        await service.calculateUserFeeDiscount();

        expect(mockDeps.debugLogger.log).toHaveBeenCalledWith(
          'RewardsIntegrationService: Fee discount calculated',
          expect.objectContaining({
            discountBips: testCase.bips,
            discountPercentage: testCase.percentage,
          }),
        );
      }
    });
  });

  describe('unified fee resolver', () => {
    // 10 bips = BUILDER_FEE_CONFIG.MaxFeeDecimal (0.001) * BASIS_POINTS_DIVISOR
    const DEFAULT_FEE_BIPS = 10;
    const FRESH_MS = 60_000;
    const MAX_STALE_MS = 10 * 60 * 1000;
    const NOW = 1_700_000_000_000;

    /**
     * Build a benefits payload that passes the eligibility gate by default.
     *
     * @param waiverOverrides - Fields to override on `perpsFeeWaiver`.
     * @param overrides - Fields to override on the benefits payload itself.
     * @returns A benefits payload.
     */
    const createBenefits = (
      waiverOverrides: Record<string, unknown> = {},
      overrides: Record<string, unknown> = {},
    ) =>
      ({
        status: 'active',
        perpsFeeWaiver: {
          entitled: true,
          usage: 'available',
          remainingNotionalUsd: 5000,
          ...waiverOverrides,
        },
        ...overrides,
      }) as never;

    /**
     * Wire a subscription benefits source onto the mocked dependencies.
     *
     * @param getPerpsBenefits - The mocked benefits reader.
     * @returns The same mock, for convenience.
     */
    const wireSubscription = (getPerpsBenefits: jest.Mock) => {
      (mockDeps as { subscription?: unknown }).subscription = {
        getPerpsBenefits,
      };
      return getPerpsBenefits;
    };

    beforeEach(() => {
      jest.useFakeTimers();
      jest.setSystemTime(NOW);
      setupMessengerDefaults();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('returns the lowest fee bips across the default, rewards and subscription sources', async () => {
      // Rewards unresolved and no subscription source: nothing beats the
      // default fee, and the discount stays undefined (not "no discount").
      (
        mockDeps.rewards.getPerpsDiscountForAccount as jest.Mock
      ).mockResolvedValue(null);
      expect(await service.resolveFee()).toMatchObject({
        feeBips: DEFAULT_FEE_BIPS,
        discountBips: undefined,
        source: 'default',
      });

      // A resolved 0% rewards discount still wins the tie over `default`, so a
      // known "no discount" answer stays distinguishable from an unknown one.
      (
        mockDeps.rewards.getPerpsDiscountForAccount as jest.Mock
      ).mockResolvedValue(0);
      expect(await service.resolveFee()).toMatchObject({
        feeBips: DEFAULT_FEE_BIPS,
        discountBips: 0,
        source: 'rewards',
      });

      // A 65% VIP/season discount undercuts the default fee.
      (
        mockDeps.rewards.getPerpsDiscountForAccount as jest.Mock
      ).mockResolvedValue(6500);
      expect(await service.resolveFee()).toMatchObject({
        feeBips: 3.5,
        discountBips: 6500,
        source: 'rewards',
      });

      // Subscription undercuts everything once the cached gate passes.
      const getPerpsBenefits = wireSubscription(
        jest.fn().mockResolvedValue(createBenefits()),
      );
      await service.refreshSubscriptionBenefits();
      expect(getPerpsBenefits).toHaveBeenCalledTimes(1);
      expect(await service.resolveFee()).toMatchObject({
        feeBips: 0,
        discountBips: 10000,
        source: 'subscription',
      });

      // ...including when the rewards source has not hydrated at all.
      (
        mockDeps.rewards.getPerpsDiscountForAccount as jest.Mock
      ).mockResolvedValue(null);
      expect(await service.resolveFee()).toMatchObject({
        feeBips: 0,
        discountBips: 10000,
        source: 'subscription',
      });
    });

    it('resolves the subscription source to a 0 bips fee only when the eligibility gate passes', async () => {
      const cases = [
        { benefits: createBenefits(), eligible: true, reason: 'eligible' },
        {
          benefits: createBenefits({}, { status: 'canceled' }),
          eligible: false,
          reason: 'inactive',
        },
        {
          benefits: createBenefits({ entitled: false }),
          eligible: false,
          reason: 'not-entitled',
        },
        {
          benefits: createBenefits({ usage: undefined }),
          eligible: false,
          reason: 'not-entitled',
        },
        {
          benefits: createBenefits({ usage: 'exhausted' }),
          eligible: false,
          reason: 'exhausted',
        },
        {
          benefits: createBenefits({ exhausted: true }),
          eligible: false,
          reason: 'exhausted',
        },
        // `null` is "no subscription to report", not "subscription inactive".
        { benefits: null, eligible: false, reason: 'no-subscription' },
      ];

      (
        mockDeps.rewards.getPerpsDiscountForAccount as jest.Mock
      ).mockResolvedValue(0);

      for (const testCase of cases) {
        mockDeps = createMockInfrastructure();
        mockMessenger = createMockMessenger();
        setupMessengerDefaults();
        (
          mockDeps.rewards.getPerpsDiscountForAccount as jest.Mock
        ).mockResolvedValue(0);
        wireSubscription(jest.fn().mockResolvedValue(testCase.benefits));
        service = new RewardsIntegrationService(mockDeps, mockMessenger);
        await service.refreshSubscriptionBenefits();

        const resolution = await service.resolveFee();

        expect(resolution.subscription).toStrictEqual(
          expect.objectContaining({
            eligible: testCase.eligible,
            reason: testCase.reason,
          }),
        );
        expect(resolution.source).toBe(
          testCase.eligible ? 'subscription' : 'rewards',
        );
        expect(resolution.feeBips).toBe(
          testCase.eligible ? 0 : DEFAULT_FEE_BIPS,
        );
      }
    });

    it('does not await the benefits network read on the fee resolution path', async () => {
      // A benefits read that never settles: if the resolver awaited it, this
      // test could not complete.
      let releaseBenefits: (value: unknown) => void = () => undefined;
      const getPerpsBenefits = wireSubscription(
        jest.fn(
          async () =>
            new Promise((resolve) => {
              releaseBenefits = resolve;
            }),
        ),
      );
      (
        mockDeps.rewards.getPerpsDiscountForAccount as jest.Mock
      ).mockResolvedValue(2500);

      const resolution = await service.resolveFee();

      expect(resolution.source).toBe('rewards');
      expect(resolution.discountBips).toBe(2500);
      expect(resolution.subscription).toStrictEqual({
        eligible: false,
        reason: 'not-hydrated',
      });
      // The refresh was kicked off, just never awaited.
      expect(getPerpsBenefits).toHaveBeenCalledTimes(1);

      releaseBenefits(null);
    });

    it('serves a stale snapshot while revalidating it in the background', async () => {
      const getPerpsBenefits = wireSubscription(
        jest.fn().mockResolvedValue(createBenefits()),
      );
      await service.refreshSubscriptionBenefits();
      expect(getPerpsBenefits).toHaveBeenCalledTimes(1);

      // Inside the freshness window: served from cache, no revalidation.
      jest.setSystemTime(NOW + FRESH_MS - 1);
      expect(service.getSubscriptionFeeWaiverStatus()).toStrictEqual({
        eligible: true,
        reason: 'eligible',
        remainingNotionalUsd: 5000,
      });
      expect(getPerpsBenefits).toHaveBeenCalledTimes(1);

      // Past it: the stale snapshot is still served, and a refresh is started.
      jest.setSystemTime(NOW + FRESH_MS + 1);
      expect(service.getSubscriptionFeeWaiverStatus()).toStrictEqual({
        eligible: true,
        reason: 'eligible',
        remainingNotionalUsd: 5000,
      });
      expect(getPerpsBenefits).toHaveBeenCalledTimes(2);
    });

    it('falls back to the next-lowest source when the cached benefits snapshot is hard-stale', async () => {
      const getPerpsBenefits = wireSubscription(
        jest.fn().mockResolvedValue(createBenefits()),
      );
      (
        mockDeps.rewards.getPerpsDiscountForAccount as jest.Mock
      ).mockResolvedValue(6500);
      await service.refreshSubscriptionBenefits();

      // Beyond the ceiling the snapshot can no longer be trusted to grant the
      // waiver, even though it says the cap is available.
      jest.setSystemTime(NOW + MAX_STALE_MS + 1);
      getPerpsBenefits.mockImplementation(
        async () => new Promise(() => undefined),
      );

      const resolution = await service.resolveFee();

      expect(resolution.subscription).toStrictEqual({
        eligible: false,
        reason: 'stale',
      });
      expect(resolution.source).toBe('rewards');
      expect(resolution.feeBips).toBe(3.5);
    });

    it('falls back to the next-lowest source when the benefits read is unreachable', async () => {
      wireSubscription(
        jest.fn().mockRejectedValue(new Error('benefits endpoint unreachable')),
      );
      (
        mockDeps.rewards.getPerpsDiscountForAccount as jest.Mock
      ).mockResolvedValue(6500);

      // The refresh swallows the failure rather than rejecting into callers.
      await expect(
        service.refreshSubscriptionBenefits(),
      ).resolves.toBeUndefined();

      const resolution = await service.resolveFee();

      expect(resolution.subscription).toStrictEqual({
        eligible: false,
        reason: 'not-hydrated',
      });
      expect(resolution.source).toBe('rewards');
      expect(resolution.discountBips).toBe(6500);
      expect(mockDeps.logger.error).toHaveBeenCalled();
    });

    it('honors exhausted=true from the backend on the next cache refresh', async () => {
      const getPerpsBenefits = wireSubscription(
        jest.fn().mockResolvedValue(createBenefits()),
      );
      (
        mockDeps.rewards.getPerpsDiscountForAccount as jest.Mock
      ).mockResolvedValue(0);
      await service.refreshSubscriptionBenefits();
      expect(await service.resolveFee()).toMatchObject({
        source: 'subscription',
        feeBips: 0,
      });

      // The backend crosses the cap. No client-side release is needed: the
      // next refresh simply stops passing the gate.
      getPerpsBenefits.mockResolvedValue(
        createBenefits({ exhausted: true, remainingNotionalUsd: 0 }),
      );
      jest.setSystemTime(NOW + FRESH_MS + 1);
      await service.refreshSubscriptionBenefits();

      const resolution = await service.resolveFee();

      expect(resolution.subscription).toStrictEqual({
        eligible: false,
        reason: 'exhausted',
        remainingNotionalUsd: 0,
      });
      expect(resolution.source).toBe('rewards');
      expect(resolution.feeBips).toBe(DEFAULT_FEE_BIPS);
      expect(resolution.discountBips).toBe(0);
    });

    it('reports no subscription source when the dependency is not wired', async () => {
      (
        mockDeps.rewards.getPerpsDiscountForAccount as jest.Mock
      ).mockResolvedValue(0);

      const resolution = await service.resolveFee();

      expect(resolution.subscription).toStrictEqual({
        eligible: false,
        reason: 'no-source',
      });
      expect(resolution.source).toBe('rewards');
    });

    it('deduplicates concurrent benefits refreshes', async () => {
      const getPerpsBenefits = wireSubscription(
        jest.fn().mockResolvedValue(createBenefits()),
      );

      await Promise.all([
        service.refreshSubscriptionBenefits(),
        service.refreshSubscriptionBenefits(),
        service.refreshSubscriptionBenefits(),
      ]);

      expect(getPerpsBenefits).toHaveBeenCalledTimes(1);
    });

    it('throttles the opportunistic refresh while the benefits read keeps failing', async () => {
      // A failing read never advances the snapshot timestamp, so without an
      // attempt-based throttle every caller would start a new request.
      const getPerpsBenefits = wireSubscription(
        jest.fn().mockRejectedValue(new Error('benefits endpoint down')),
      );

      await service.refreshSubscriptionBenefits();
      expect(getPerpsBenefits).toHaveBeenCalledTimes(1);

      // Ten fee previews inside the freshness window: still one request.
      for (let i = 0; i < 10; i++) {
        expect(service.getSubscriptionFeeWaiverStatus()).toStrictEqual({
          eligible: false,
          reason: 'not-hydrated',
        });
      }
      expect(getPerpsBenefits).toHaveBeenCalledTimes(1);

      // Past the window, exactly one retry is allowed through.
      jest.setSystemTime(NOW + FRESH_MS + 1);
      service.getSubscriptionFeeWaiverStatus();
      service.getSubscriptionFeeWaiverStatus();
      await Promise.resolve();

      expect(getPerpsBenefits).toHaveBeenCalledTimes(2);
    });

    it('invalidates the cached benefits snapshot on demand', async () => {
      const getPerpsBenefits = wireSubscription(
        jest.fn().mockResolvedValue(createBenefits()),
      );
      await service.refreshSubscriptionBenefits();
      expect(service.getSubscriptionFeeWaiverStatus().eligible).toBe(true);

      // Sign-out / profile switch: the snapshot must stop answering for the
      // previous profile immediately, not at the next freshness boundary.
      service.invalidateSubscriptionBenefits();

      expect(service.getSubscriptionFeeWaiverStatus()).toStrictEqual({
        eligible: false,
        reason: 'not-hydrated',
      });
      // Invalidation clears the retry throttle too, so the refetch is immediate.
      expect(getPerpsBenefits).toHaveBeenCalledTimes(2);
    });

    it('uses a background refresh that lands during the rewards round trip', async () => {
      const getPerpsBenefits = wireSubscription(
        jest.fn().mockResolvedValue(createBenefits()),
      );
      // The rewards read resolves only after the benefits refresh has landed,
      // which is exactly the window a pre-await snapshot would miss.
      (
        mockDeps.rewards.getPerpsDiscountForAccount as jest.Mock
      ).mockImplementation(async () => {
        await service.refreshSubscriptionBenefits();
        return 6500;
      });

      const resolution = await service.resolveFee();

      expect(getPerpsBenefits).toHaveBeenCalled();
      expect(resolution.subscription.eligible).toBe(true);
      expect(resolution.source).toBe('subscription');
      expect(resolution.feeBips).toBe(0);
    });

    it('keeps calculateUserFeeDiscount returning the resolved discount bips', async () => {
      wireSubscription(jest.fn().mockResolvedValue(createBenefits()));
      (
        mockDeps.rewards.getPerpsDiscountForAccount as jest.Mock
      ).mockResolvedValue(6500);
      await service.refreshSubscriptionBenefits();

      expect(await service.calculateUserFeeDiscount()).toBe(10000);
    });
  });

  describe('instance isolation', () => {
    it('each instance uses its own deps', async () => {
      const mockDeps2 = createMockInfrastructure();
      const mockMessenger2 = createMockMessenger();
      const service2 = new RewardsIntegrationService(mockDeps2, mockMessenger2);

      // First service - no EVM account
      (mockMessenger.call as jest.Mock).mockImplementation((action: string) => {
        if (
          action === 'AccountTreeController:getAccountsFromSelectedAccountGroup'
        ) {
          return [];
        }
        return undefined;
      });
      await service.calculateUserFeeDiscount();

      // Second service - no EVM account
      (mockMessenger2.call as jest.Mock).mockImplementation(
        (action: string) => {
          if (
            action ===
            'AccountTreeController:getAccountsFromSelectedAccountGroup'
          ) {
            return [];
          }
          return undefined;
        },
      );
      await service2.calculateUserFeeDiscount();

      // Each instance should use its own logger: one "no account" log plus the
      // resolver's outcome log.
      expect(mockDeps.debugLogger.log).toHaveBeenCalledTimes(2);
      expect(mockDeps2.debugLogger.log).toHaveBeenCalledTimes(2);
    });
  });
});
