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
  PerpsRecoveredDispatch,
  ReconcileChaseOrderCancellationParams,
  ReconcileChaseOrderCancellationResult,
  SwitchProviderResult,
  ToggleTestnetResult,
} from '../../src/types/index.js';
import { wait } from '../../src/utils/wait.js';
import { createMockHyperLiquidProvider } from '../helpers/providerMocks.js';
import {
  createDeferred,
  createKeyringlessMessenger,
  createMockInfrastructure,
  createMockEvmAccount,
} from '../helpers/serviceMocks.js';

jest.mock('@nktkas/hyperliquid', () => ({}));
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

const ROLLBACK_CHANGES = [
  {
    name: 'provider',
    change: (
      controller: RecoveryContextController,
    ): Promise<SwitchProviderResult> => controller.switchProvider('aggregated'),
    constructorCalls: 4,
  },
  {
    name: 'network',
    change: (
      controller: RecoveryContextController,
    ): Promise<ToggleTestnetResult> => controller.toggleTestnet(),
    constructorCalls: 3,
  },
];

/**
 * Fail every target initialization attempt and allow provider-switch rollback.
 * Network-toggle rollback restores selection but leaves initialization failed.
 *
 * @param replacement - New provider available if the rollback reinitializes.
 */
function failTargetInitialization(
  replacement: ReturnType<typeof createMockHyperLiquidProvider>,
): void {
  let attempts = 0;
  jest.mocked(HyperLiquidProvider).mockImplementation(() => {
    attempts += 1;
    if (attempts <= 3) {
      throw new Error('Target provider initialization failed');
    }
    return replacement;
  });
}

describe('PerpsController recovered-dispatch acknowledgment context', () => {
  beforeEach(() => {
    jest.mocked(wait).mockReset().mockResolvedValue(undefined);
    jest.mocked(HyperLiquidProvider).mockReset();
  });

  it.each(CONTEXT_CHANGES)(
    'refuses stale Scale inventory before provider readiness after $name changes',
    async ({ change }) => {
      const fixture = createFixture();
      const getScaleOrderGroups = jest.fn().mockResolvedValue([]);
      Object.assign(fixture.provider, { getScaleOrderGroups });
      const result = fixture.controller.getScaleOrderGroups();
      change(fixture);
      await expect(result).rejects.toThrow(
        PERPS_ERROR_CODES.PROVIDER_LIFECYCLE_STALE,
      );
      expect(getScaleOrderGroups).not.toHaveBeenCalled();
    },
  );

  it.each(CONTEXT_CHANGES)(
    'refuses stale Scale inventory after awaited provider call and $name changes',
    async ({ change }) => {
      const fixture = createFixture();
      const review = createDeferred<[]>();
      const entered = createDeferred<void>();
      Object.assign(fixture.provider, {
        getScaleOrderGroups: jest.fn(async () => {
          entered.resolve();
          return review.promise;
        }),
      });
      const result = fixture.controller.getScaleOrderGroups();
      await entered.promise;
      change(fixture);
      review.resolve([]);
      await expect(result).rejects.toThrow(
        PERPS_ERROR_CODES.PROVIDER_LIFECYCLE_STALE,
      );
    },
  );

  it.each(CONTEXT_CHANGES)(
    'refuses stale Scale review after awaited provider call and $name changes',
    async ({ change }) => {
      const fixture = createFixture();
      const review = createDeferred<[]>();
      const entered = createDeferred<void>();
      Object.assign(fixture.provider, {
        reviewScaleOrderGroups: jest.fn(async () => {
          entered.resolve();
          return review.promise;
        }),
      });
      const result = fixture.controller.reviewScaleOrderGroups({
        providerId: 'hyperliquid',
      });
      await entered.promise;
      change(fixture);
      review.resolve([]);
      await expect(result).rejects.toThrow(
        PERPS_ERROR_CODES.PROVIDER_LIFECYCLE_STALE,
      );
    },
  );

  it('requires an explicit Scale review route in aggregated mode', async () => {
    const fixture = createFixture();
    fixture.controller.changeContext({ activeProvider: 'aggregated' });
    await expect(fixture.controller.reviewScaleOrderGroups()).rejects.toThrow(
      PERPS_ERROR_CODES.PROVIDER_NOT_FOUND,
    );
  });

  it('refuses a Scale review route that differs from the active provider', async () => {
    const fixture = createFixture();
    const reviewScaleOrderGroups = jest.fn().mockResolvedValue([]);
    Object.assign(fixture.provider, { reviewScaleOrderGroups });
    await expect(
      fixture.controller.reviewScaleOrderGroups({ providerId: 'lighter' }),
    ).rejects.toThrow(PERPS_ERROR_CODES.PROVIDER_NOT_FOUND);
    expect(reviewScaleOrderGroups).not.toHaveBeenCalled();
  });

  describe('Chase cancellation reconciliation context', () => {
    const params = (): ReconcileChaseOrderCancellationParams => ({
      providerId: 'hyperliquid',
      handle: 'original-chase',
      clientOrderId: '101',
      owner: {
        providerId: 'hyperliquid',
        walletAddress: ACCOUNT_A,
        network: 'testnet',
        accountIndex: 28,
        apiKeyIndex: 7,
      },
      cancellation: { nonce: 209, txHash: 'b'.repeat(64), expiresAt: 110000 },
    });
    const unsupported: ReconcileChaseOrderCancellationResult = {
      status: 'unsupported',
      providerId: 'hyperliquid',
      handle: 'original-chase',
      reason: 'Test capability unavailable',
    };

    it('reports unsupported without falling back to ordinary cancellation', async () => {
      const fixture = createFixture();
      await fixture.controller.init();
      expect(
        await fixture.host.messenger.call(
          'PerpsController:reconcileChaseOrderCancellation',
          params(),
        ),
      ).toMatchObject({ status: 'unsupported', providerId: 'hyperliquid' });
      expect(jest.mocked(fixture.provider).cancelOrder.mock.calls).toHaveLength(
        0,
      );
    });
    it.each(CONTEXT_CHANGES)(
      'rejects stale reconciliation before readiness after $name changes',
      async ({ change }) => {
        const fixture = createFixture();
        const reconcile = jest.fn().mockResolvedValue(unsupported);
        Object.assign(fixture.provider, {
          reconcileChaseOrderCancellation: reconcile,
        });
        const result =
          fixture.controller.reconcileChaseOrderCancellation(params());
        change(fixture);
        await expect(result).rejects.toThrow(
          PERPS_ERROR_CODES.PROVIDER_LIFECYCLE_STALE,
        );
        expect(reconcile).not.toHaveBeenCalled();
        expect(
          jest.mocked(fixture.provider).cancelOrder.mock.calls,
        ).toHaveLength(0);
      },
    );
    it.each(CONTEXT_CHANGES)(
      'rejects stale reconciliation after provider await and $name changes',
      async ({ change }) => {
        const fixture = createFixture();
        const result = createDeferred<ReconcileChaseOrderCancellationResult>();
        const entered = createDeferred<void>();
        const reconcile = jest.fn(async () => {
          entered.resolve();
          return result.promise;
        });
        Object.assign(fixture.provider, {
          reconcileChaseOrderCancellation: reconcile,
        });
        await fixture.controller.init();
        const pending = fixture.host.messenger.call(
          'PerpsController:reconcileChaseOrderCancellation',
          params(),
        );
        await entered.promise;
        change(fixture);
        result.resolve(unsupported);
        await expect(pending).rejects.toThrow(
          PERPS_ERROR_CODES.PROVIDER_LIFECYCLE_STALE,
        );
        expect(reconcile).toHaveBeenCalledTimes(1);
        expect(
          jest.mocked(fixture.provider).cancelOrder.mock.calls,
        ).toHaveLength(0);
      },
    );
    it('captures exact caller identity before readiness', async () => {
      const fixture = createFixture();
      const input = params();
      const expected = structuredClone(input);
      const reconcile = jest.fn().mockResolvedValue(unsupported);
      Object.assign(fixture.provider, {
        reconcileChaseOrderCancellation: reconcile,
      });
      const pending = fixture.controller.reconcileChaseOrderCancellation(input);
      input.owner.apiKeyIndex = 8;
      input.cancellation.nonce = 210;
      expect(await pending).toStrictEqual(unsupported);
      expect(reconcile).toHaveBeenCalledWith(expected);
    });
    it('rejects a provider route different from the active context', async () => {
      const fixture = createFixture();
      const reconcile = jest.fn().mockResolvedValue(unsupported);
      Object.assign(fixture.provider, {
        reconcileChaseOrderCancellation: reconcile,
      });
      const input = params();
      input.providerId = 'lighter';
      input.owner.providerId = 'lighter';
      await expect(
        fixture.controller.reconcileChaseOrderCancellation(input),
      ).rejects.toThrow(/active context/u);
      expect(reconcile).not.toHaveBeenCalled();
      expect(jest.mocked(fixture.provider).cancelOrder.mock.calls).toHaveLength(
        0,
      );
    });
    it('propagates a lost provider reply without retry or ordinary cancellation', async () => {
      const fixture = createFixture();
      const reconcile = jest
        .fn()
        .mockRejectedValue(new Error('reconciliation reply lost'));
      Object.assign(fixture.provider, {
        reconcileChaseOrderCancellation: reconcile,
      });
      await expect(
        fixture.controller.reconcileChaseOrderCancellation(params()),
      ).rejects.toThrow('reconciliation reply lost');
      expect(reconcile).toHaveBeenCalledTimes(1);
      expect(jest.mocked(fixture.provider).cancelOrder.mock.calls).toHaveLength(
        0,
      );
    });
  });

  describe.each([
    'reconcileRecoveredDispatches',
    'getRecoveredDispatches',
  ] as const)('reconciliation through %s', (capability) => {
    const dispatches: PerpsRecoveredDispatch[] = [
      {
        recoveryId: LEGACY_ID,
        walletAddress: ACCOUNT_A,
        kind: 1,
        intent: 'Recovered test dispatch',
        txHash: null,
        outcome: 'unknown',
        evidence: 'unresolved',
      },
    ];

    it.each(CONTEXT_CHANGES)(
      'refuses stale reconciliation before provider readiness after $name changes',
      async ({ change }) => {
        const fixture = createFixture();
        const read = jest.fn().mockResolvedValue(dispatches);
        Object.assign(fixture.provider, { [capability]: read });

        const result = fixture.controller.reconcileRecoveredDispatches();
        change(fixture);

        await expect(result).rejects.toThrow(
          PERPS_ERROR_CODES.PROVIDER_LIFECYCLE_STALE,
        );
        expect(read).not.toHaveBeenCalled();
      },
    );

    it.each(CONTEXT_CHANGES)(
      'refuses stale reconciliation after awaited provider call and $name changes',
      async ({ change }) => {
        const fixture = createFixture();
        const completion = createDeferred<PerpsRecoveredDispatch[]>();
        const entered = createDeferred<void>();
        const read = jest.fn(async () => {
          entered.resolve();
          return completion.promise;
        });
        Object.assign(fixture.provider, { [capability]: read });

        const result = fixture.controller.reconcileRecoveredDispatches();
        await entered.promise;
        change(fixture);
        completion.resolve(dispatches);

        await expect(result).rejects.toThrow(
          PERPS_ERROR_CODES.PROVIDER_LIFECYCLE_STALE,
        );
        expect(read).toHaveBeenCalledTimes(1);
      },
    );

    it('returns the exact provider result after an unchanged-context await', async () => {
      const fixture = createFixture();
      const completion = createDeferred<PerpsRecoveredDispatch[]>();
      const entered = createDeferred<void>();
      const read = jest.fn(async () => {
        entered.resolve();
        return completion.promise;
      });
      Object.assign(fixture.provider, { [capability]: read });

      const result = fixture.controller.reconcileRecoveredDispatches();
      await entered.promise;
      completion.resolve(dispatches);

      expect(await result).toBe(dispatches);
      expect(read).toHaveBeenCalledTimes(1);
    });

    it.each(CONTEXT_CHANGES)(
      'preserves readiness rejection after $name changes',
      async ({ change }) => {
        const fixture = createFixture(false);
        const read = jest.fn().mockResolvedValue(dispatches);
        Object.assign(fixture.provider, { [capability]: read });

        const result = fixture.controller.reconcileRecoveredDispatches();
        change(fixture);

        await expect(result).rejects.toThrow(
          PERPS_ERROR_CODES.CLIENT_NOT_INITIALIZED,
        );
        expect(read).not.toHaveBeenCalled();
      },
    );

    it.each(CONTEXT_CHANGES)(
      'preserves the exact provider rejection after $name changes in flight',
      async ({ change }) => {
        const fixture = createFixture();
        const completion = createDeferred<PerpsRecoveredDispatch[]>();
        const entered = createDeferred<void>();
        const failure = new Error('Original reconciliation rejection');
        const read = jest.fn(async () => {
          entered.resolve();
          return completion.promise;
        });
        Object.assign(fixture.provider, { [capability]: read });

        const result = fixture.controller.reconcileRecoveredDispatches();
        await entered.promise;
        change(fixture);
        completion.reject(failure);

        await expect(result).rejects.toBe(failure);
        expect(read).toHaveBeenCalledTimes(1);
      },
    );
  });

  it('returns an empty reconciliation when neither provider capability is available', async () => {
    const { controller } = createFixture();

    expect(await controller.reconcileRecoveredDispatches()).toStrictEqual([]);
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

  it('rejects a retired lifetime while readiness waits without redirecting to its replacement', async () => {
    const { controller, provider, acknowledge, ledgers } = createFixture(false);
    const readiness = createDeferred<void>();
    jest.mocked(wait).mockReturnValueOnce(readiness.promise);
    jest.mocked(HyperLiquidProvider).mockImplementation(() => provider);
    const replacement = Object.assign(createMockHyperLiquidProvider(), {
      acknowledgeRecoveredDispatch: jest.fn(async () => undefined),
    });
    const initialization = controller.init();
    const result = controller.acknowledgeRecoveredDispatch(LEGACY_ID);
    const disconnected = controller.disconnect();
    const replaced = disconnected.then(async () => {
      jest.mocked(HyperLiquidProvider).mockImplementation(() => replacement);
      await controller.init();
    });
    readiness.resolve();
    await initialization;
    await replaced;

    await expect(result).rejects.toThrow(
      PERPS_ERROR_CODES.PROVIDER_LIFECYCLE_STALE,
    );
    expect(acknowledge).not.toHaveBeenCalled();
    expect(replacement.acknowledgeRecoveredDispatch).not.toHaveBeenCalled();
    expect(ledgers.get(ACCOUNT_A)).toStrictEqual(new Set([LEGACY_ID]));
    expect(ledgers.get(ACCOUNT_B)).toStrictEqual(new Set([LEGACY_ID]));
  });

  it.each(['success', 'rejection'] as const)(
    'preserves issuing storage and %s after same-context lifetime retirement',
    async (outcome) => {
      const { controller, acknowledge, ledgers } = createFixture();
      const started = createDeferred<void>();
      const completion = createDeferred<void>();
      const failure = new Error('Original retired-provider rejection');
      const replacement = Object.assign(createMockHyperLiquidProvider(), {
        acknowledgeRecoveredDispatch: jest.fn(async () => undefined),
      });
      acknowledge.mockImplementationOnce(async (id) => {
        started.resolve();
        await completion.promise;
        if (outcome === 'rejection') {
          throw failure;
        }
        ledgers.get(ACCOUNT_A)?.delete(id);
      });
      const result = controller.acknowledgeRecoveredDispatch(LEGACY_ID);
      const settled = result.then(
        () => undefined,
        (error: unknown) => error,
      );
      await started.promise;

      await controller.disconnect();
      controller.activate(replacement);
      completion.resolve();

      const error = await settled;
      expect(error).toStrictEqual(
        outcome === 'success'
          ? new Error(PERPS_ERROR_CODES.PROVIDER_LIFECYCLE_STALE)
          : failure,
      );
      expect(outcome === 'rejection' ? error === failure : true).toBe(true);
      expect(acknowledge).toHaveBeenCalledTimes(1);
      expect(acknowledge).toHaveBeenCalledWith(LEGACY_ID);
      expect(replacement.acknowledgeRecoveredDispatch).not.toHaveBeenCalled();
      expect(ledgers.get(ACCOUNT_A)).toStrictEqual(
        new Set(outcome === 'success' ? [] : [LEGACY_ID]),
      );
      expect(ledgers.get(ACCOUNT_B)).toStrictEqual(new Set([LEGACY_ID]));
    },
  );

  it.each(ROLLBACK_CHANGES)(
    'refuses held readiness after a failed $name switch restores the context',
    async ({ change, constructorCalls }) => {
      const { controller, acknowledge, ledgers, provider } = createFixture();
      const disconnect = jest.spyOn(provider, 'disconnect');
      const replacement = Object.assign(createMockHyperLiquidProvider(), {
        acknowledgeRecoveredDispatch: jest.fn(async () => undefined),
      });
      failTargetInitialization(replacement);

      const rollback = change(controller);
      const result = controller.acknowledgeRecoveredDispatch(LEGACY_ID);
      const settled = result.then(
        () => undefined,
        (error: unknown) => error,
      );
      const transition = await rollback;

      expect(transition.success).toBe(false);
      expect(HyperLiquidProvider).toHaveBeenCalledTimes(constructorCalls);
      expect(disconnect).toHaveBeenCalledTimes(1);
      expect(controller.state.activeProvider).toBe('hyperliquid');
      expect(controller.state.isTestnet).toBe(true);
      expect(await settled).toStrictEqual(
        new Error(PERPS_ERROR_CODES.PROVIDER_LIFECYCLE_STALE),
      );
      expect(acknowledge).not.toHaveBeenCalled();
      expect(replacement.acknowledgeRecoveredDispatch).not.toHaveBeenCalled();
      expect(ledgers.get(ACCOUNT_A)).toStrictEqual(new Set([LEGACY_ID]));
      expect(ledgers.get(ACCOUNT_B)).toStrictEqual(new Set([LEGACY_ID]));
    },
  );

  it.each(
    ROLLBACK_CHANGES.flatMap((change) =>
      (['success', 'rejection'] as const).map((outcome) => ({
        ...change,
        outcome,
      })),
    ),
  )(
    'preserves issuing storage and $outcome after a failed $name switch',
    async ({ change, constructorCalls, outcome }) => {
      const { controller, acknowledge, ledgers, provider } = createFixture();
      const disconnect = jest.spyOn(provider, 'disconnect');
      const replacement = Object.assign(createMockHyperLiquidProvider(), {
        acknowledgeRecoveredDispatch: jest.fn(async () => undefined),
      });
      const started = createDeferred<void>();
      const completion = createDeferred<void>();
      const failure = new Error('Original provider rejection after rollback');
      acknowledge.mockImplementationOnce(async (id) => {
        started.resolve();
        await completion.promise;
        if (outcome === 'rejection') {
          throw failure;
        }
        ledgers.get(ACCOUNT_A)?.delete(id);
      });
      const result = controller.acknowledgeRecoveredDispatch(LEGACY_ID);
      const settled = result.then(
        () => undefined,
        (error: unknown) => error,
      );
      await started.promise;
      failTargetInitialization(replacement);

      const transition = await change(controller);
      completion.resolve();
      const error = await settled;

      expect(transition.success).toBe(false);
      expect(HyperLiquidProvider).toHaveBeenCalledTimes(constructorCalls);
      expect(disconnect).toHaveBeenCalledTimes(1);
      expect(controller.state.activeProvider).toBe('hyperliquid');
      expect(controller.state.isTestnet).toBe(true);
      expect(error).toStrictEqual(
        outcome === 'success'
          ? new Error(PERPS_ERROR_CODES.PROVIDER_LIFECYCLE_STALE)
          : failure,
      );
      expect(error === failure).toBe(outcome === 'rejection');
      expect(acknowledge).toHaveBeenCalledTimes(1);
      expect(acknowledge).toHaveBeenCalledWith(LEGACY_ID);
      expect(replacement.acknowledgeRecoveredDispatch).not.toHaveBeenCalled();
      expect(ledgers.get(ACCOUNT_A)).toStrictEqual(
        new Set(outcome === 'success' ? [] : [LEGACY_ID]),
      );
      expect(ledgers.get(ACCOUNT_B)).toStrictEqual(new Set([LEGACY_ID]));
    },
  );

  it('reports unavailable initialization for a new acknowledgment after a failed network switch', async () => {
    const { controller, acknowledge, ledgers, provider } = createFixture();
    const disconnect = jest.spyOn(provider, 'disconnect');
    failTargetInitialization(createMockHyperLiquidProvider());

    const transition = await controller.toggleTestnet();

    expect(transition.success).toBe(false);
    expect(disconnect).toHaveBeenCalledTimes(1);
    expect(controller.state.initializationState).toBe(
      InitializationState.Failed,
    );
    expect(controller.isCurrentlyReinitializing()).toBe(false);
    await expect(
      controller.acknowledgeRecoveredDispatch(LEGACY_ID),
    ).rejects.toThrow(PERPS_ERROR_CODES.CLIENT_NOT_INITIALIZED);
    expect(acknowledge).not.toHaveBeenCalled();
    expect(ledgers.get(ACCOUNT_A)).toStrictEqual(new Set([LEGACY_ID]));
    expect(ledgers.get(ACCOUNT_B)).toStrictEqual(new Set([LEGACY_ID]));
  });

  it('acknowledges through a new initialization after a failed network switch', async () => {
    const { controller, acknowledge, ledgers } = createFixture();
    failTargetInitialization(createMockHyperLiquidProvider());
    const transition = await controller.toggleTestnet();
    expect(transition.success).toBe(false);
    const readiness = createDeferred<void>();
    jest.mocked(wait).mockReturnValueOnce(readiness.promise);
    const replacement = Object.assign(createMockHyperLiquidProvider(), {
      acknowledgeRecoveredDispatch: jest.fn(async (id: string) => {
        ledgers.get(ACCOUNT_A)?.delete(id);
      }),
    });
    jest.mocked(HyperLiquidProvider).mockImplementation(() => replacement);
    const initialization = controller.init();
    expect(controller.state.initializationState).toBe(
      InitializationState.Initializing,
    );
    expect(controller.isCurrentlyReinitializing()).toBe(false);

    const result = controller.acknowledgeRecoveredDispatch(LEGACY_ID);
    const settled = result.then(
      () => undefined,
      (error: unknown) => error,
    );
    readiness.resolve();
    await initialization;

    expect(await settled).toBeUndefined();
    expect(controller.getActiveProvider()).toBe(replacement);
    expect(acknowledge).not.toHaveBeenCalled();
    expect(replacement.acknowledgeRecoveredDispatch).toHaveBeenCalledTimes(1);
    expect(replacement.acknowledgeRecoveredDispatch).toHaveBeenCalledWith(
      LEGACY_ID,
    );
    expect(ledgers.get(ACCOUNT_A)).toStrictEqual(new Set());
    expect(ledgers.get(ACCOUNT_B)).toStrictEqual(new Set([LEGACY_ID]));
  });

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

  it('preserves cold-start readiness failure when no provider lifetime existed', async () => {
    const { controller, acknowledge, ledgers } = createFixture(false);
    jest.mocked(HyperLiquidProvider).mockImplementation(() => {
      throw new Error('Cold-start initialization failed');
    });
    const initialization = controller.init();

    const result = controller.acknowledgeRecoveredDispatch(LEGACY_ID);
    const settled = result.then(
      () => undefined,
      (error: unknown) => error,
    );
    await initialization;

    expect(await settled).toStrictEqual(
      new Error(PERPS_ERROR_CODES.CLIENT_NOT_INITIALIZED),
    );
    expect(acknowledge).not.toHaveBeenCalled();
    expect(ledgers.get(ACCOUNT_A)).toStrictEqual(new Set([LEGACY_ID]));
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
