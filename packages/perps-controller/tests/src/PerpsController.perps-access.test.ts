import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mock, MockedClass, MockInstance } from 'vitest';

import { PERPS_ACCESS_CONFIG } from '../../src/constants/perpsConfig.js';
import {
  PerpsController,
  getDefaultPerpsControllerState,
} from '../../src/PerpsController.js';
import { HyperLiquidProvider } from '../../src/providers/HyperLiquidProvider.js';
import type {
  MarketInfo,
  PerpsAccessPolicy,
  PerpsEnrollment,
  PerpsPlatformDependencies,
  PerpsProvider,
  PerpsProviderType,
  PerpsVenueAccess,
} from '../../src/types/index.js';
import {
  createMockHyperLiquidProvider,
  createMockPosition,
} from '../helpers/providerMocks.js';
import {
  createMockInfrastructure,
  createMockMessenger,
} from '../helpers/serviceMocks.js';

vi.mock('@nktkas/hyperliquid', () => ({}));
vi.mock('../../src/providers/HyperLiquidProvider');
vi.mock('../../src/utils/wait', () => ({
  wait: vi.fn().mockResolvedValue(undefined),
}));

const POLICY_URL = 'https://api.test/v1/perps/access-policy';
const ACCOUNT_A = '0x00000000000000000000000000000000000000aa';
const ACCOUNT_B = '0x00000000000000000000000000000000000000bb';

const venue = (
  providerId: PerpsProviderType,
  marketSource: string | null,
  overrides: Partial<PerpsVenueAccess> = {},
): PerpsVenueAccess => ({
  providerId,
  marketSource,
  listed: true,
  access: 'trade',
  ...overrides,
});

const usProgram = {
  id: 'us',
  enrollable: true,
  venues: [venue('hyperliquid', 'ignp')],
};

const ALLOWED: PerpsAccessPolicy = {
  venues: [
    venue('hyperliquid', null),
    venue('hyperliquid', 'xyz'),
    venue('lighter', null),
  ],
  programs: [{ ...usProgram, enrollable: false }],
  ttlSeconds: 3600,
};

const BLOCKED: PerpsAccessPolicy = {
  venues: [
    venue('hyperliquid', null, { listed: false, access: 'view' }),
    venue('hyperliquid', 'xyz', { listed: false, access: 'view' }),
  ],
  programs: [{ ...usProgram, enrollable: false }],
  ttlSeconds: 3600,
};

const US: PerpsAccessPolicy = {
  venues: [
    venue('hyperliquid', null, { listed: false, access: 'view' }),
    venue('hyperliquid', 'xyz', { listed: false, access: 'view' }),
    venue('hyperliquid', 'ignp'),
  ],
  programs: [usProgram],
  ttlSeconds: 3600,
};

class TestController extends PerpsController {
  getProviders(): Map<PerpsProviderType, PerpsProvider> {
    return this.providers;
  }
}

/** Minimal Lighter stand-in: no `setAccess`, so it has no fence. */
class FakeLighterProvider {
  readonly protocolId = 'lighter';

  disconnect = vi.fn().mockResolvedValue({ success: true });

  getPositions = vi.fn().mockResolvedValue([]);
}

const deferred = (): {
  promise: Promise<PerpsEnrollment>;
  resolve: (value: PerpsEnrollment) => void;
} => {
  let resolve: (value: PerpsEnrollment) => void = () => null;
  const promise = new Promise<PerpsEnrollment>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
};

const jsonResponse = (body: unknown): Response =>
  ({ ok: true, status: 200, json: async () => body }) as Response;

describe('PerpsController perps access', () => {
  let flags: Record<string, unknown>;
  let geolocation: string;
  let selectedAddress: string;
  let infrastructure: PerpsPlatformDependencies;
  let hyperLiquid: ReturnType<typeof createMockHyperLiquidProvider> & {
    getEnrollment: Mock;
    setAccess: Mock;
  };
  let fetchMock: MockInstance<typeof fetch>;
  let loadLighter: Mock;
  let handlers: Map<string, ((...args: unknown[]) => void)[]>;
  let controller: TestController;

  const emit = (event: string, ...args: unknown[]): void => {
    for (const handler of handlers.get(event) ?? []) {
      handler(...args);
    }
  };

  const respondWith = (policy: PerpsAccessPolicy): void => {
    fetchMock.mockResolvedValue(jsonResponse(policy));
  };

  const createController = (
    lighterEnabled = false,
    state = getDefaultPerpsControllerState(),
  ): TestController =>
    new TestController({
      messenger: createMockMessenger({
        call: vi.fn().mockImplementation((action: string) => {
          if (action === 'RemoteFeatureFlagController:getState') {
            return { remoteFeatureFlags: flags };
          }
          if (action === 'GeolocationController:getGeolocation') {
            return Promise.resolve(geolocation);
          }
          if (
            action ===
            'AccountTreeController:getAccountsFromSelectedAccountGroup'
          ) {
            return [
              {
                id: selectedAddress,
                address: selectedAddress,
                type: 'eip155:eoa',
                options: {},
                scopes: ['eip155:1'],
                methods: [],
                metadata: {
                  name: 'Test',
                  importTime: 0,
                  keyring: { type: 'HD Key Tree' },
                },
              },
            ];
          }
          return null;
        }),
        subscribe: vi
          .fn()
          .mockImplementation(
            (event: string, handler: (...args: unknown[]) => void) => {
              handlers.set(event, [...(handlers.get(event) ?? []), handler]);
            },
          ),
      }),
      state,
      clientConfig: {
        fallbackBlockedRegions: ['US'],
        ...(lighterEnabled && {
          providerCredentials: {
            lighter: { enabled: true, loadProvider: loadLighter },
          },
        }),
      },
      infrastructure,
    });

  const settle = async (): Promise<void> => {
    for (let index = 0; index < 20; index++) {
      await Promise.resolve();
    }
    await vi.advanceTimersByTimeAsync(0);
  };

  beforeEach(() => {
    flags = { perpsAccessEnabled: true };
    geolocation = 'FR';
    selectedAddress = ACCOUNT_A;
    handlers = new Map();
    infrastructure = createMockInfrastructure();
    infrastructure.terminalApi = { accessPolicyUrl: POLICY_URL };
    hyperLiquid = Object.assign(createMockHyperLiquidProvider(), {
      getEnrollment: vi.fn().mockResolvedValue('none'),
      setAccess: vi.fn(),
    });
    hyperLiquid.getPositions.mockResolvedValue([]);
    hyperLiquid.getMarkets.mockResolvedValue([]);
    hyperLiquid.disconnect.mockResolvedValue({ success: true });
    (
      HyperLiquidProvider as MockedClass<typeof HyperLiquidProvider>
    ).mockImplementation(function () {
      return hyperLiquid;
    });
    loadLighter = vi
      .fn()
      .mockResolvedValue({ LighterProvider: FakeLighterProvider });
    fetchMock = vi.spyOn(globalThis, 'fetch');
    respondWith(ALLOWED);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('flag off', () => {
    it('keeps perpsAccess null and fetches nothing', async () => {
      flags = {};
      controller = createController(true);

      await controller.init();

      expect(controller.state.perpsAccess).toBeNull();
      expect(fetchMock).not.toHaveBeenCalled();
      expect([...controller.getProviders().keys()]).toStrictEqual([
        'hyperliquid',
        'lighter',
      ]);
    });

    it('returns to null and today providers when the flag turns off', async () => {
      respondWith(US);
      controller = createController(true);
      await controller.init();
      expect(controller.getProviders().has('lighter')).toBe(false);

      flags = {};
      emit('RemoteFeatureFlagController:stateChange', {
        remoteFeatureFlags: flags,
      });
      await settle();

      expect(controller.state.perpsAccess).toBeNull();
      await vi.waitFor(() =>
        expect(controller.getProviders().has('lighter')).toBe(true),
      );
    });
  });

  describe('backend answers', () => {
    it('applies an allowed answer and keeps a fully open Lighter', async () => {
      controller = createController(true);

      await controller.init();

      expect(fetchMock).toHaveBeenCalledWith(
        `${POLICY_URL}?network=mainnet`,
        expect.anything(),
      );
      expect(controller.state.perpsAccess).toStrictEqual({
        address: ACCOUNT_A,
        venues: ALLOWED.venues,
      });
      expect(controller.state.isEligible).toBe(true);
      expect(controller.getProviders().has('lighter')).toBe(true);
    });

    it('makes a blocked answer view-only without Lighter', async () => {
      respondWith(BLOCKED);
      controller = createController(true);

      await controller.init();

      expect(controller.state.isEligible).toBe(false);
      expect([...controller.getProviders().keys()]).toStrictEqual([
        'hyperliquid',
      ]);
      expect(loadLighter).not.toHaveBeenCalled();
    });

    it('never loads Lighter for a US answer and refuses to switch to it', async () => {
      respondWith(US);
      controller = createController(true);

      await controller.init();

      expect(loadLighter).not.toHaveBeenCalled();
      expect(await controller.switchProvider('lighter')).toStrictEqual({
        success: false,
        providerId: 'hyperliquid',
        error: 'Provider lighter not available: not permitted by perps access',
      });
      expect(await controller.switchProvider('aggregated')).toMatchObject({
        success: true,
      });
      expect([...controller.getProviders().keys()]).toStrictEqual([
        'hyperliquid',
      ]);
    });

    it('drops a Lighter with view venues because it has no fence', async () => {
      respondWith({
        ...ALLOWED,
        venues: [
          venue('hyperliquid', null),
          venue('lighter', null, { access: 'view' }),
        ],
      });
      controller = createController(true);

      await controller.init();

      expect(loadLighter).toHaveBeenCalled();
      expect(controller.getProviders().has('lighter')).toBe(false);
    });

    it('hands access to providers that enforce it', async () => {
      respondWith(US);
      controller = createController();

      await controller.init();

      expect(hyperLiquid.setAccess).toHaveBeenLastCalledWith(
        controller.state.perpsAccess,
      );
    });

    it('requests the snapshot with the listed venues as dexes', async () => {
      respondWith(US);
      const fetchGlobalSnapshot = vi.fn().mockResolvedValue({
        markets: [{ symbol: 'ignp:AAPL' }, { symbol: 'xyz:TSLA' }],
        marketInfos: [],
        expiresAt: Date.now() + 30_000,
      });
      infrastructure.terminalApi = {
        accessPolicyUrl: POLICY_URL,
        globalSnapshotUrl: 'https://api.test/v4/perpetuals',
      };
      infrastructure.terminalMarketService = {
        fetchMarkets: vi.fn(),
        clearCache: vi.fn(),
        logError: vi.fn(),
        fetchGlobalSnapshot,
      };
      controller = createController();
      await controller.init();

      const markets = await controller.getMarketDataWithPrices();

      expect(fetchGlobalSnapshot).toHaveBeenCalledWith({
        provider: 'hyperliquid',
        network: 'mainnet',
        enabledDexes: ['ignp'],
      });
      expect(markets.map((market) => market.symbol)).toStrictEqual([
        'ignp:AAPL',
      ]);
    });

    it('drops markets from unlisted venues', async () => {
      respondWith(US);
      controller = createController();
      await controller.init();
      hyperLiquid.getMarkets.mockResolvedValue([
        { name: 'BTC' },
        { name: 'xyz:TSLA' },
        { name: 'ignp:AAPL' },
      ] as MarketInfo[]);

      const markets = await controller.getMarkets();

      expect(markets.map((market) => market.name)).toStrictEqual(['ignp:AAPL']);
    });
  });

  describe('programs', () => {
    const enroll = (enrollment: PerpsEnrollment): void => {
      hyperLiquid.getEnrollment.mockResolvedValue(enrollment);
    };

    it('gives an approved wallet its program venues in any region', async () => {
      enroll('approved');
      controller = createController(true);

      await controller.init();

      expect(controller.state.perpsAccess?.venues).toStrictEqual(
        usProgram.venues,
      );
      expect(controller.getProviders().has('lighter')).toBe(false);
    });

    it('makes a reduce-only wallet view-only', async () => {
      enroll('reduceOnly');
      controller = createController();

      await controller.init();

      expect(controller.state.perpsAccess?.venues).toStrictEqual([
        venue('hyperliquid', 'ignp', { access: 'view' }),
      ]);
      expect(controller.state.isEligible).toBe(false);
    });

    it('makes a removed wallet with program positions view-only on that venue', async () => {
      enroll('none');
      respondWith(US);
      hyperLiquid.getPositions.mockResolvedValue([
        createMockPosition({ symbol: 'ignp:AAPL' }),
      ]);
      controller = createController();

      await controller.init();

      expect(hyperLiquid.getPositions).toHaveBeenCalledWith({
        standalone: true,
        userAddress: ACCOUNT_A,
      });
      expect(controller.state.perpsAccess?.venues).toContainEqual(
        venue('hyperliquid', 'ignp', { access: 'view' }),
      );
      expect(controller.state.isEligible).toBe(false);
    });

    it('treats a failed position read as positions on every program venue', async () => {
      enroll('none');
      respondWith(US);
      hyperLiquid.getPositions.mockRejectedValue(new Error('down'));
      controller = createController();

      await controller.init();

      expect(controller.state.perpsAccess?.venues).toContainEqual(
        venue('hyperliquid', 'ignp', { access: 'view' }),
      );
    });

    it('keeps the selected wallet result when an earlier answer lands late (A→B→A)', async () => {
      const lateA = deferred();
      const answers = new Map([
        [ACCOUNT_A, lateA.promise],
        [ACCOUNT_B, Promise.resolve<PerpsEnrollment>('none')],
      ]);
      hyperLiquid.getEnrollment.mockImplementation(async (address: string) =>
        answers.get(address),
      );
      controller = createController();
      await settle();

      selectedAddress = ACCOUNT_B;
      emit('AccountsController:selectedAccountChange');
      await settle();
      expect(controller.state.perpsAccess).toStrictEqual({
        address: ACCOUNT_B,
        venues: ALLOWED.venues,
      });

      lateA.resolve('approved');
      await settle();
      expect(controller.state.perpsAccess?.address).toBe(ACCOUNT_B);

      selectedAddress = ACCOUNT_A;
      emit('AccountsController:selectedAccountChange');
      await settle();
      expect(controller.state.perpsAccess).toStrictEqual({
        address: ACCOUNT_A,
        venues: usProgram.venues,
      });
    });
  });

  describe('fallback', () => {
    it('keeps today venues for an allowed region when the backend is unreachable', async () => {
      fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
      controller = createController(true);

      await controller.init();

      expect(controller.state.perpsAccess?.venues).toStrictEqual([
        venue('hyperliquid', null),
        venue('lighter', null),
      ]);
      expect(controller.state.isEligible).toBe(true);
      expect(controller.getProviders().has('lighter')).toBe(true);
    });

    it.each(['US', 'UNKNOWN'])(
      'makes every venue view-only for %s',
      async (region) => {
        geolocation = region;
        fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
        controller = createController(true);

        await controller.init();

        expect(controller.state.perpsAccess?.venues).toStrictEqual([
          venue('hyperliquid', null, { listed: false, access: 'view' }),
          venue('lighter', null, { listed: false, access: 'view' }),
        ]);
        expect(controller.getProviders().has('lighter')).toBe(false);
      },
    );

    it('uses a fresh cached answer offline', async () => {
      await infrastructure.diskCache.setItem(
        `${PERPS_ACCESS_CONFIG.DiskCacheKeyPrefix}mainnet`,
        JSON.stringify({ policy: US, fetchedAt: Date.now() }),
      );
      fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
      controller = createController();

      // Program venues stay view-only until the wallet's enrollment is known.
      expect(controller.state.perpsAccess?.venues).toStrictEqual([
        ...US.venues.slice(0, 2),
        venue('hyperliquid', 'ignp', { access: 'view' }),
      ]);
      await controller.init();
      expect(controller.state.perpsAccess?.venues).toStrictEqual(US.venues);
    });

    it('falls back when the cached answer expired, keeping an enrolled wallet program venues', async () => {
      hyperLiquid.getEnrollment.mockResolvedValue('approved');
      await infrastructure.diskCache.setItem(
        `${PERPS_ACCESS_CONFIG.DiskCacheKeyPrefix}mainnet`,
        JSON.stringify({ policy: US, fetchedAt: Date.now() - 3_600_001 }),
      );
      fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
      geolocation = 'US';
      controller = createController();

      await controller.init();

      expect(controller.state.perpsAccess?.venues).toStrictEqual(
        usProgram.venues,
      );
    });

    it('removes Lighter when the answer expires in a blocked region', async () => {
      controller = createController(true);
      await controller.init();
      expect(controller.getProviders().has('lighter')).toBe(true);

      geolocation = 'US';
      vi.setSystemTime(Date.now() + ALLOWED.ttlSeconds * 1000);
      fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
      await controller.refreshEligibility();
      await settle();

      await vi.waitFor(() =>
        expect(controller.getProviders().has('lighter')).toBe(false),
      );
      expect(controller.state.isEligible).toBe(false);
    });

    it('starts view-only without a cache until the answer arrives', () => {
      controller = createController();

      expect(controller.state.perpsAccess?.venues).toStrictEqual([
        venue('hyperliquid', null, { listed: false, access: 'view' }),
      ]);
    });
  });

  it('applies interim access for a new wallet before its enrollment resolves', async () => {
    respondWith(US);
    const pendingB = deferred();
    const answers = new Map([
      [ACCOUNT_A, Promise.resolve<PerpsEnrollment>('approved')],
      [ACCOUNT_B, pendingB.promise],
    ]);
    hyperLiquid.getEnrollment.mockImplementation(async (address: string) =>
      answers.get(address),
    );
    controller = createController();
    await controller.init();
    expect(controller.state.isEligible).toBe(true);

    selectedAddress = ACCOUNT_B;
    emit('AccountsController:selectedAccountChange');

    expect(controller.state.perpsAccess).toStrictEqual({
      address: ACCOUNT_B,
      venues: [
        ...US.venues.slice(0, 2),
        venue('hyperliquid', 'ignp', { access: 'view' }),
      ],
    });
    expect(controller.state.isEligible).toBe(false);

    await settle();
    pendingB.resolve('none');
    await vi.waitFor(() =>
      expect(controller.state.perpsAccess?.venues).toStrictEqual(US.venues),
    );
  });

  it('initializes providers without waiting longer than the limit for access', async () => {
    fetchMock.mockReturnValue(new Promise<Response>(() => null));
    controller = createController();

    const started = Date.now();
    await controller.init();

    expect(Date.now() - started).toBeLessThan(
      PERPS_ACCESS_CONFIG.FetchTimeoutMs,
    );
    expect(controller.getProviders().has('hyperliquid')).toBe(true);
    expect(controller.state.perpsAccess?.venues).toStrictEqual([
      venue('hyperliquid', null, { listed: false, access: 'view' }),
    ]);
  });

  it('reads program positions once per wallet until the next policy fetch', async () => {
    respondWith(US);
    controller = createController();
    await controller.init();
    const reads = hyperLiquid.getPositions.mock.calls.length;

    await controller.refreshEligibility();
    await settle();

    expect(hyperLiquid.getPositions.mock.calls).toHaveLength(reads);
  });

  it('fetches again for the new network on a network switch', async () => {
    controller = createController();
    await controller.init();

    await controller.toggleTestnet();

    expect(fetchMock).toHaveBeenCalledWith(
      `${POLICY_URL}?network=testnet`,
      expect.anything(),
    );
  });
});
