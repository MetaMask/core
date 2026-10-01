import {
  getDefaultPerpsControllerState,
  InitializationState,
  PerpsController,
} from '../../src/PerpsController.js';
import { PERPS_ERROR_CODES } from '../../src/perpsErrorCodes.js';
import { HyperLiquidProvider } from '../../src/providers/HyperLiquidProvider.js';
import type {
  PerpsActiveProviderMode,
  PerpsProvider,
} from '../../src/types/index.js';
import { wait } from '../../src/utils/wait.js';
import { createMockHyperLiquidProvider } from '../helpers/providerMocks.js';
import {
  createDeferred,
  createKeyringlessMessenger,
  createMockInfrastructure,
  createMockEvmAccount,
} from '../helpers/serviceMocks.js';

jest.mock('../../src/providers/HyperLiquidProvider.js');
jest.mock('../../src/utils/wait.js', () => ({ wait: jest.fn() }));

const ACCOUNT_A = createMockEvmAccount().address;
const ACCOUNT_B = '0xabcdef1234567890abcdef1234567890abcdef12';
const LEGACY_ID = '42:nohash';

class RecoveryContextController extends PerpsController {
  /**
   * Supply an initialized provider for the public acknowledgment boundary.
   *
   * @param provider - Provider with observable local recovery state.
   */
  activate(provider: PerpsProvider): void {
    this.providers.set('hyperliquid', provider);
    this.activeProviderInstance = provider;
    this.isInitialized = true;
    this.update((state) => {
      state.initializationState = InitializationState.Initialized;
    });
  }

  /**
   * Model host context changes without an unrelated provider setup operation.
   *
   * @param change - Network or provider selection made by the host.
   * @param change.isTestnet - Updated network selection.
   * @param change.activeProvider - Updated provider selection.
   */
  changeContext(change: {
    isTestnet?: boolean;
    activeProvider?: PerpsActiveProviderMode;
  }): void {
    this.update((state) => Object.assign(state, change));
  }
}

type Fixture = {
  controller: RecoveryContextController;
  provider: ReturnType<typeof createMockHyperLiquidProvider> & {
    acknowledgeRecoveredDispatch: jest.MockedFunction<
      NonNullable<PerpsProvider['acknowledgeRecoveredDispatch']>
    >;
  };
  acknowledge: jest.MockedFunction<
    NonNullable<PerpsProvider['acknowledgeRecoveredDispatch']>
  >;
  ledgers: Map<string, Set<string>>;
  selectAccount: (address: `0x${string}`) => void;
  host: ReturnType<typeof createKeyringlessMessenger>;
};

/**
 * Create a real controller and host messenger with two colliding legacy IDs.
 * Only the provider boundary and initialization delay are mocked.
 *
 * @param initialized - Whether to start with an already available provider.
 * @returns Controller, provider calls, local outcomes and host selection.
 */
function createFixture(initialized = true): Fixture {
  const host = createKeyringlessMessenger();
  host.rootMessenger.registerActionHandler(
    'RemoteFeatureFlagController:getState',
    () => ({ remoteFeatureFlags: {}, cacheTimestamp: 0 }),
  );
  host.rootMessenger.delegate({
    actions: ['RemoteFeatureFlagController:getState'],
    events: [
      'RemoteFeatureFlagController:stateChange',
      'AccountsController:selectedAccountChange',
      'AccountTreeController:selectedAccountGroupChange',
    ],
    messenger: host.messenger,
  });
  let selectedAddress: string = ACCOUNT_A;
  const ledgers = new Map([
    [ACCOUNT_A, new Set([LEGACY_ID])],
    [ACCOUNT_B, new Set([LEGACY_ID])],
  ]);
  const acknowledge = jest.fn(async (id: string) => {
    ledgers.get(selectedAddress)?.delete(id);
  });
  const provider = Object.assign(createMockHyperLiquidProvider(), {
    acknowledgeRecoveredDispatch: acknowledge,
  }) satisfies PerpsProvider;
  const controller = new RecoveryContextController({
    messenger: host.messenger,
    state: { ...getDefaultPerpsControllerState(), isTestnet: true },
    infrastructure: createMockInfrastructure(),
    deferEligibilityCheck: true,
  });
  if (initialized) {
    controller.activate(provider);
  }
  const selectAccount = (address: `0x${string}`): void => {
    selectedAddress = address.toLowerCase();
    host.selectAccount(address);
  };
  return { controller, provider, acknowledge, ledgers, selectAccount, host };
}

const CONTEXT_CHANGES: {
  name: string;
  change: (fixture: Fixture) => void;
}[] = [
  { name: 'account', change: ({ selectAccount }) => selectAccount(ACCOUNT_B) },
  {
    name: 'network',
    change: ({ controller }) => controller.changeContext({ isTestnet: false }),
  },
  {
    name: 'provider mode',
    change: ({ controller }) =>
      controller.changeContext({ activeProvider: 'aggregated' }),
  },
];

describe('PerpsController recovered-dispatch acknowledgment context', () => {
  beforeEach(() => {
    jest.mocked(wait).mockReset().mockResolvedValue(undefined);
    jest.mocked(HyperLiquidProvider).mockReset();
  });

  it.each(CONTEXT_CHANGES)(
    'refuses acknowledgment after $name changes while readiness returns',
    async ({ change }) => {
      const fixture = createFixture();
      const { controller, acknowledge, ledgers } = fixture;

      const result = controller.acknowledgeRecoveredDispatch(LEGACY_ID);
      change(fixture);

      await expect(result).rejects.toThrow(
        PERPS_ERROR_CODES.PROVIDER_LIFECYCLE_STALE,
      );
      expect(acknowledge).not.toHaveBeenCalled();
      expect(ledgers.get(ACCOUNT_A)).toStrictEqual(new Set([LEGACY_ID]));
      expect(ledgers.get(ACCOUNT_B)).toStrictEqual(new Set([LEGACY_ID]));
    },
  );

  it('refuses acknowledgment after the selected account disappears', async () => {
    const { controller, acknowledge, host, ledgers } = createFixture();

    const result = controller.acknowledgeRecoveredDispatch(LEGACY_ID);
    host.deselectAccount();

    await expect(result).rejects.toThrow(
      PERPS_ERROR_CODES.PROVIDER_LIFECYCLE_STALE,
    );
    expect(acknowledge).not.toHaveBeenCalled();
    expect(ledgers.get(ACCOUNT_A)).toStrictEqual(new Set([LEGACY_ID]));
    expect(ledgers.get(ACCOUNT_B)).toStrictEqual(new Set([LEGACY_ID]));
  });

  // Direct-provider initialization covers account/network drift here. Provider
  // mode drift is covered at readiness return and during provider completion.
  it.each(CONTEXT_CHANGES.filter(({ name }) => name !== 'provider mode'))(
    'refuses acknowledgment after $name changes during initialization',
    async ({ change }) => {
      const fixture = createFixture(false);
      const { controller, acknowledge, ledgers } = fixture;
      const readiness = createDeferred<void>();
      jest.mocked(wait).mockReturnValueOnce(readiness.promise);
      jest
        .mocked(HyperLiquidProvider)
        .mockImplementation(() => fixture.provider);
      const initialization = controller.init();

      const result = controller.acknowledgeRecoveredDispatch(LEGACY_ID);
      change(fixture);
      readiness.resolve();
      await initialization;

      await expect(result).rejects.toThrow(
        PERPS_ERROR_CODES.PROVIDER_LIFECYCLE_STALE,
      );
      expect(acknowledge).not.toHaveBeenCalled();
      expect(ledgers.get(ACCOUNT_A)).toStrictEqual(new Set([LEGACY_ID]));
      expect(ledgers.get(ACCOUNT_B)).toStrictEqual(new Set([LEGACY_ID]));
    },
  );

  it.each(CONTEXT_CHANGES)(
    'rejects a completed acknowledgment after $name changes in flight',
    async ({ change }) => {
      const fixture = createFixture();
      const { controller, acknowledge, ledgers } = fixture;
      const started = createDeferred<void>();
      const completion = createDeferred<void>();
      acknowledge.mockImplementationOnce(async (id) => {
        started.resolve();
        await completion.promise;
        ledgers.get(ACCOUNT_A)?.delete(id);
      });

      const result = controller.acknowledgeRecoveredDispatch(LEGACY_ID);
      await started.promise;
      change(fixture);
      completion.resolve();

      await expect(result).rejects.toThrow(
        PERPS_ERROR_CODES.PROVIDER_LIFECYCLE_STALE,
      );
      expect(acknowledge).toHaveBeenCalledTimes(1);
      expect(acknowledge).toHaveBeenCalledWith(LEGACY_ID);
      expect(ledgers.get(ACCOUNT_A)).toStrictEqual(new Set());
      expect(ledgers.get(ACCOUNT_B)).toStrictEqual(new Set([LEGACY_ID]));
    },
  );

  it('acknowledges the exact legacy ID in an unchanged context', async () => {
    const { controller, acknowledge, ledgers } = createFixture();

    await controller.acknowledgeRecoveredDispatch(LEGACY_ID);

    expect(acknowledge).toHaveBeenCalledTimes(1);
    expect(acknowledge).toHaveBeenCalledWith(LEGACY_ID);
    expect(ledgers.get(ACCOUNT_A)).toStrictEqual(new Set());
    expect(ledgers.get(ACCOUNT_B)).toStrictEqual(new Set([LEGACY_ID]));
  });

  it('acknowledges after initialization in an unchanged context', async () => {
    const { controller, provider, acknowledge, ledgers } = createFixture(false);
    const readiness = createDeferred<void>();
    jest.mocked(wait).mockReturnValueOnce(readiness.promise);
    jest.mocked(HyperLiquidProvider).mockImplementation(() => provider);
    const initialization = controller.init();

    const result = controller.acknowledgeRecoveredDispatch(LEGACY_ID);
    readiness.resolve();
    await initialization;
    await result;

    expect(acknowledge).toHaveBeenCalledTimes(1);
    expect(ledgers.get(ACCOUNT_A)).toStrictEqual(new Set());
    expect(ledgers.get(ACCOUNT_B)).toStrictEqual(new Set([LEGACY_ID]));
  });

  it.each(CONTEXT_CHANGES)(
    'preserves the exact provider rejection after $name changes in flight',
    async ({ change }) => {
      const fixture = createFixture();
      const { controller, acknowledge, ledgers } = fixture;
      const started = createDeferred<void>();
      const completion = createDeferred<void>();
      const failure = new Error('Original provider rejection');
      acknowledge.mockImplementationOnce(async () => {
        started.resolve();
        await completion.promise;
        throw failure;
      });

      const result = controller.acknowledgeRecoveredDispatch(LEGACY_ID);
      await started.promise;
      change(fixture);
      completion.resolve();

      await expect(result).rejects.toBe(failure);
      expect(acknowledge).toHaveBeenCalledTimes(1);
      expect(acknowledge).toHaveBeenCalledWith(LEGACY_ID);
      expect(ledgers.get(ACCOUNT_A)).toStrictEqual(new Set([LEGACY_ID]));
      expect(ledgers.get(ACCOUNT_B)).toStrictEqual(new Set([LEGACY_ID]));
    },
  );

  it('preserves provider rejection without clearing either ledger', async () => {
    const { controller, acknowledge, ledgers } = createFixture();
    const failure = new Error('Recovery ID is not eligible');
    acknowledge.mockRejectedValueOnce(failure);

    const result = controller.acknowledgeRecoveredDispatch(LEGACY_ID);

    await expect(result).rejects.toBe(failure);
    expect(ledgers.get(ACCOUNT_A)).toStrictEqual(new Set([LEGACY_ID]));
    expect(ledgers.get(ACCOUNT_B)).toStrictEqual(new Set([LEGACY_ID]));
  });
});
