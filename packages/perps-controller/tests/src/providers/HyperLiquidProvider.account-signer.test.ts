import type { Hex } from '@metamask/utils';

import {
  PERPS_EVENT_PROPERTY,
  PERPS_EVENT_VALUE,
} from '../../../src/constants/eventNames.js';
import {
  BUILDER_FEE_CONFIG,
  REFERRAL_CONFIG,
} from '../../../src/constants/hyperLiquidConfig.js';
import { PERPS_CONSTANTS } from '../../../src/constants/perpsConfig.js';
import { PERPS_ERROR_CODES } from '../../../src/perpsErrorCodes.js';
import { HyperLiquidProvider } from '../../../src/providers/HyperLiquidProvider.js';
import {
  AgentBindings,
  AgentSignerUnavailableError,
} from '../../../src/services/agentSigner.js';
import { HyperLiquidClientService } from '../../../src/services/HyperLiquidClientService.js';
import type { HyperLiquidWalletParams } from '../../../src/services/HyperLiquidClientService.js';
import { HyperLiquidSubscriptionService } from '../../../src/services/HyperLiquidSubscriptionService.js';
import {
  PerpsSigningCache,
  TradingReadinessCache,
} from '../../../src/services/TradingReadinessCache.js';
import {
  HL_ABSTRACTION_WIRE,
  HL_UNIFIED_ACCOUNT_MODE,
} from '../../../src/types/hyperliquid-types.js';
import { PerpsAnalyticsEvent } from '../../../src/types/index.js';
import type {
  HyperLiquidCredentials,
  PerpsAgentAccount,
  PerpsAgentSigner,
  PerpsPlatformDependencies,
  PerpsTypedDataPayload,
} from '../../../src/types/index.js';
import {
  AGENT_ADDRESS,
  AGENT_SIGNATURE,
  APPROVE_BUILDER_FEE_PAYLOAD,
  L1_PAYLOAD,
  MAIN_SIGNATURE,
  OTHER_AGENT_ADDRESS,
  OTHER_AGENT_SIGNATURE,
  USER_SIGNED_PAYLOAD,
  createFrontendOpenOrder,
} from '../../helpers/agentFixtures.js';
import {
  createMockExchangeClient,
  createMockInfoClient,
} from '../../helpers/providerMocks.js';
import {
  createDeferred,
  createKeyringMessenger,
  createKeyringlessMessenger,
  createMockEvmAccount,
  createMockInfrastructure,
  keyringCalls,
} from '../../helpers/serviceMocks.js';

// The SDK ships ES modules only; the provider reaches it through the mocked
// client service, so the module itself is never loaded.
jest.mock('@nktkas/hyperliquid', () => ({}));

// The client and subscription services are mocked: they own the SDK's
// REST/exchange/info clients and the WebSocket subscriptions. The wallet
// service, the signing caches and the validation run for real.
jest.mock('../../../src/services/HyperLiquidClientService');
jest.mock('../../../src/services/HyperLiquidSubscriptionService');

const CACHED_PRICES: Record<string, string> = { BTC: '50000', ETH: '3000' };

const MockedHyperLiquidClientService =
  HyperLiquidClientService as jest.MockedClass<typeof HyperLiquidClientService>;
const MockedHyperLiquidSubscriptionService =
  HyperLiquidSubscriptionService as jest.MockedClass<
    typeof HyperLiquidSubscriptionService
  >;

describe('HyperLiquidProvider with a real wallet service and accountSigner', () => {
  let mockClientService: jest.Mocked<HyperLiquidClientService>;
  let mockPlatformDependencies: PerpsPlatformDependencies;
  let loggerError: jest.SpyInstance;
  let trackPerpsEvent: jest.SpyInstance;

  beforeEach(() => {
    TradingReadinessCache.clearAll();
    mockPlatformDependencies = createMockInfrastructure();
    loggerError = jest.spyOn(mockPlatformDependencies.logger, 'error');
    trackPerpsEvent = jest.spyOn(
      mockPlatformDependencies.metrics,
      'trackPerpsEvent',
    );
    mockClientService = {
      initialize: jest.fn(),
      isInitialized: jest.fn().mockReturnValue(true),
      isTestnetMode: jest.fn().mockReturnValue(false),
      ensureInitialized: jest.fn(),
      getExchangeClient: jest.fn().mockReturnValue(createMockExchangeClient()),
      getInfoClient: jest.fn().mockReturnValue(createMockInfoClient()),
      fetchHistoricalOrders: jest.fn().mockResolvedValue([]),
      disconnect: jest.fn().mockResolvedValue(undefined),
      toggleTestnet: jest.fn(),
      setTestnetMode: jest.fn(),
      getNetwork: jest.fn().mockReturnValue('mainnet'),
      ensureSubscriptionClient: jest.fn().mockResolvedValue(undefined),
      getSubscriptionClient: jest.fn(),
      setOnReconnectCallback: jest.fn(),
      setOnTerminateCallback: jest.fn(),
      getConnectionState: jest.fn().mockReturnValue('connected'),
    } as Partial<HyperLiquidClientService> as jest.Mocked<HyperLiquidClientService>;
    const mockSubscriptionService = {
      subscribeToPrices: jest.fn().mockResolvedValue(jest.fn()),
      subscribeToPositions: jest.fn().mockReturnValue(jest.fn()),
      subscribeToOrderFills: jest.fn().mockReturnValue(jest.fn()),
      clearAll: jest.fn(),
      isPositionsCacheInitialized: jest.fn().mockReturnValue(false),
      getCachedPositionsForDex: jest.fn().mockReturnValue(null),
      getFreshPositionsForAllDexs: jest.fn().mockReturnValue(null),
      getCachedPositions: jest.fn().mockReturnValue([]),
      updateFeatureFlags: jest.fn().mockResolvedValue(undefined),
      setDexMetaCache: jest.fn(),
      setDexAssetCtxsCache: jest.fn(),
      getDexAssetCtxsCache: jest.fn().mockReturnValue(undefined),
      getCachedPrice: jest.fn((symbol: string) => CACHED_PRICES[symbol]),
      getLastAllMidsSnapshot: jest.fn().mockReturnValue(null),
      isOrdersCacheInitialized: jest.fn().mockReturnValue(false),
      getCachedOrders: jest.fn().mockReturnValue([]),
      getOrdersCacheIfInitialized: jest.fn().mockReturnValue(null),
      setUserAbstractionMode: jest.fn(),
    } as Partial<HyperLiquidSubscriptionService> as jest.Mocked<HyperLiquidSubscriptionService>;
    MockedHyperLiquidClientService.mockImplementation(() => mockClientService);
    MockedHyperLiquidSubscriptionService.mockImplementation(
      () => mockSubscriptionService,
    );
  });

  // The wallet service and the signing caches are real. By default the
  // messenger has no KeyringController (the `keyring` option adds one), so
  // every main-account signature must reach the injected accountSigner. The SDK exchange client is the mocked
  // boundary: like the SDK, it signs through the wallet the provider
  // initialized it with.
  const ACCOUNT_ADDRESS = createMockEvmAccount().address;
  const OTHER_ACCOUNT_ADDRESS =
    '0x00000000000000000000000000000000000b0b01' as const;

  // A fixed clock for cache timestamps.
  const NOW = 1_700_000_000_000;

  // The SDK writes the provider makes for the selected account on mainnet.
  const MIGRATION_WRITE = [
    { user: ACCOUNT_ADDRESS, abstraction: HL_UNIFIED_ACCOUNT_MODE },
  ];
  const SILENT_MIGRATION_WRITE = [
    { abstraction: HL_ABSTRACTION_WIRE.unifiedAccount },
  ];
  const REFERRAL_WRITE = [{ code: REFERRAL_CONFIG.MainnetCode }];
  const BUILDER_FEE_WRITE = [
    {
      builder: BUILDER_FEE_CONFIG.MainnetBuilder,
      maxFeeRate: BUILDER_FEE_CONFIG.MaxFeeRate,
    },
  ];

  /**
   * Whether the unified-account migration is recorded as attempted for the
   * selected account on mainnet.
   *
   * @returns True once the migration result is cached.
   */
  function migrationAttempted(): boolean {
    return (
      TradingReadinessCache.get('mainnet', ACCOUNT_ADDRESS)?.attempted ?? false
    );
  }

  /**
   * Whether the referral write is recorded as attempted for the selected
   * account on mainnet.
   *
   * @returns True once the referral result is cached.
   */
  function referralAttempted(): boolean {
    return (
      PerpsSigningCache.getReferral('mainnet', ACCOUNT_ADDRESS)?.attempted ??
      false
    );
  }

  /**
   * A getAgentSigner that stays pending until the test settles it, and
   * signals when it is asked.
   *
   * @returns The resolver mock, its answer and the "asked" signal.
   */
  function createPendingResolver(): {
    getAgentSigner: jest.Mock;
    answer: ReturnType<typeof createDeferred<PerpsAgentSigner | null>>;
    asked: Promise<void>;
  } {
    const answer = createDeferred<PerpsAgentSigner | null>();
    const asked = createDeferred<void>();
    const getAgentSigner = jest.fn(async () => {
      asked.resolve();
      return await answer.promise;
    });
    return { getAgentSigner, answer, asked: asked.promise };
  }

  type Options = {
    signer?: {
      isReady?: () => boolean;
      requiresSignatureConfirmation?: () => boolean;
    };
    abstraction?: 'dexAbstraction' | 'default' | 'unifiedAccount';
    getAgentSigner?: HyperLiquidCredentials['getAgentSigner'];
    onAgentRejected?: jest.Mock;
    // Sign through a KeyringController instead of accountSigner.
    keyring?: boolean;
    // Extra SDK client methods, for the strategy order endpoints.
    exchange?: Record<string, jest.Mock>;
    info?: Record<string, jest.Mock>;
  };

  type AccountSignerFixture = {
    accountSignerProvider: HyperLiquidProvider;
    accountSigner: {
      signTypedData: jest.Mock;
      signPersonalMessage: jest.Mock;
    };
    agentSigner: { address: Hex; signTypedData: jest.Mock };
    call: jest.SpyInstance;
    exchangeClient: ReturnType<typeof createMockExchangeClient>;
    infoClient: ReturnType<typeof createMockInfoClient>;
    initialize: jest.Mock<Promise<void>, [HyperLiquidWalletParams]>;
    selectAccount: (address: Hex) => void;
  };

  function createAccountSignerProvider(
    options: Options = {},
  ): AccountSignerFixture {
    const accountSigner = {
      signTypedData: jest.fn().mockResolvedValue(MAIN_SIGNATURE),
      signPersonalMessage: jest.fn(),
      ...options.signer,
    };
    const agentSigner = {
      address: AGENT_ADDRESS,
      signTypedData: jest.fn().mockResolvedValue(AGENT_SIGNATURE),
    };
    const { messenger, call, selectAccount } = options.keyring
      ? createKeyringMessenger(MAIN_SIGNATURE)
      : createKeyringlessMessenger();
    let sdkWallet: HyperLiquidWalletParams | undefined;
    const initialize = jest.fn(async (wallet: HyperLiquidWalletParams) => {
      sdkWallet = wallet;
    });
    const signThroughSdkWallet =
      (
        payload: PerpsTypedDataPayload,
        response: Record<string, unknown> = { status: 'ok' },
      ): (() => Promise<Record<string, unknown>>) =>
      async () => {
        if (!sdkWallet) {
          throw new Error('SDK used before initialize');
        }
        try {
          await sdkWallet.signTypedData(payload);
        } catch (error) {
          // Like the SDK, which keeps the wallet error as the cause.
          throw new Error('Failed to sign the typed data using the wallet', {
            cause: error,
          });
        }
        return response;
      };
    const exchangeClient = createMockExchangeClient({
      userSetAbstraction: jest.fn(signThroughSdkWallet(USER_SIGNED_PAYLOAD)),
      agentSetAbstraction: jest.fn(signThroughSdkWallet(L1_PAYLOAD)),
      setReferrer: jest.fn(signThroughSdkWallet(L1_PAYLOAD)),
      approveBuilderFee: jest.fn(
        signThroughSdkWallet(APPROVE_BUILDER_FEE_PAYLOAD),
      ),
      order: jest.fn(
        signThroughSdkWallet(L1_PAYLOAD, {
          status: 'ok',
          response: { data: { statuses: [{ resting: { oid: 123 } }] } },
        }),
      ),
      ...options.exchange,
    });
    const infoClient = createMockInfoClient({
      userAbstraction: jest
        .fn()
        .mockResolvedValue(options.abstraction ?? 'dexAbstraction'),
      ...options.info,
    });
    // Each provider gets its own client service (and so its own SDK clients
    // and wallet); the rest is shared with the suite's mock.
    const clientService = {
      ...mockClientService,
      initialize,
      getExchangeClient: jest.fn().mockReturnValue(exchangeClient),
      getInfoClient: jest.fn().mockReturnValue(infoClient),
    } as Partial<HyperLiquidClientService> as jest.Mocked<HyperLiquidClientService>;
    MockedHyperLiquidClientService.mockImplementationOnce(() => clientService);
    const accountSignerProvider = new HyperLiquidProvider({
      platformDependencies: options.keyring
        ? mockPlatformDependencies
        : { ...mockPlatformDependencies, accountSigner },
      messenger,
      initialAssetMapping: [
        ['BTC', 0],
        ['ETH', 1],
      ],
      getAgentSigner: options.getAgentSigner,
      onAgentRejected: options.onAgentRejected,
    });
    return {
      accountSignerProvider,
      accountSigner,
      agentSigner,
      call,
      exchangeClient,
      infoClient,
      initialize,
      selectAccount,
    };
  }

  it('signs the init-time unified-account migration through accountSigner', async () => {
    const { accountSignerProvider, accountSigner, call, exchangeClient } =
      createAccountSignerProvider();

    await accountSignerProvider.getMarketDataWithPrices();

    expect(exchangeClient.userSetAbstraction.mock.calls).toStrictEqual([
      MIGRATION_WRITE,
    ]);
    expect(accountSigner.signTypedData.mock.calls).toStrictEqual([
      [ACCOUNT_ADDRESS, USER_SIGNED_PAYLOAD],
    ]);
    expect(keyringCalls(call)).toStrictEqual([]);
  });

  it('defers the init-time migration when accountSigner requires signature confirmation', async () => {
    const { accountSignerProvider, accountSigner, call, exchangeClient } =
      createAccountSignerProvider({
        signer: { requiresSignatureConfirmation: () => true },
      });

    await accountSignerProvider.getMarketDataWithPrices();

    expect(exchangeClient.userSetAbstraction).not.toHaveBeenCalled();
    expect(accountSigner.signTypedData).not.toHaveBeenCalled();
    expect(keyringCalls(call)).toStrictEqual([]);
  });

  it('treats a not-ready accountSigner as a locked keyring and caches nothing', async () => {
    const { accountSignerProvider, accountSigner, call, exchangeClient } =
      createAccountSignerProvider({ signer: { isReady: () => false } });

    await accountSignerProvider.getMarketDataWithPrices();

    expect(exchangeClient.userSetAbstraction.mock.calls).toStrictEqual([
      MIGRATION_WRITE,
    ]);
    expect(accountSigner.signTypedData).not.toHaveBeenCalled();
    expect(migrationAttempted()).toBe(false);
    expect(keyringCalls(call)).toStrictEqual([]);
    expect(loggerError).not.toHaveBeenCalled();
    // The migration is only reported as required, never as failed.
    expect(trackPerpsEvent.mock.calls).toStrictEqual([
      [
        PerpsAnalyticsEvent.AccountSetup,
        {
          [PERPS_EVENT_PROPERTY.ABSTRACTION_MODE]: 'dexAbstraction',
          [PERPS_EVENT_PROPERTY.STATUS]:
            PERPS_EVENT_VALUE.STATUS.MIGRATION_REQUIRED,
        },
      ],
    ]);
  });

  it('fails an order with KEYRING_LOCKED without logging while accountSigner is not ready', async () => {
    const { accountSignerProvider, accountSigner } =
      createAccountSignerProvider({
        abstraction: 'unifiedAccount',
        signer: { isReady: () => false },
      });

    const order = await accountSignerProvider.placeOrder({
      symbol: 'BTC',
      isBuy: true,
      size: '0.1',
      orderType: 'market',
      currentPrice: 50000,
    });

    expect(order).toStrictEqual({
      success: false,
      error: PERPS_ERROR_CODES.KEYRING_LOCKED,
    });
    expect(accountSigner.signTypedData).not.toHaveBeenCalled();
    expect(loggerError).not.toHaveBeenCalled();
    expect(referralAttempted()).toBe(false);
  });

  it('fails a TP/SL update with KEYRING_LOCKED without logging while the builder fee cannot be approved', async () => {
    const { accountSignerProvider, accountSigner, exchangeClient } =
      createAccountSignerProvider({
        abstraction: 'unifiedAccount',
        signer: { isReady: () => false },
        // Not approved yet, and the locked signer cannot approve it.
        info: { maxBuilderFee: jest.fn().mockResolvedValue(0) },
      });

    const result = await accountSignerProvider.updatePositionTPSL({
      symbol: 'BTC',
      takeProfitPrice: '60000',
    });

    expect(result).toStrictEqual({
      success: false,
      error: PERPS_ERROR_CODES.KEYRING_LOCKED,
    });
    expect(accountSigner.signTypedData).not.toHaveBeenCalled();
    expect(exchangeClient.order).not.toHaveBeenCalled();
    expect(loggerError).not.toHaveBeenCalled();
  });

  describe('when the signer locks before a user-signed write', () => {
    /**
     * A provider whose withdrawals and DEX transfers sign through the SDK
     * wallet, with a switch that locks the signer.
     *
     * @returns The provider, the two endpoints and the lock switch.
     */
    function createLockingProvider(): AccountSignerFixture & {
      withdraw3: jest.Mock;
      lock: () => void;
    } {
      let signerReady = true;
      const fixture = createAccountSignerProvider({
        abstraction: 'unifiedAccount',
        signer: { isReady: () => signerReady },
      });
      const signUserAction = async (): Promise<Record<string, unknown>> => {
        await fixture.initialize.mock.calls[0][0].signTypedData(
          USER_SIGNED_PAYLOAD,
        );
        return { status: 'ok' };
      };
      const withdraw3 = jest.fn(signUserAction);
      Object.assign(fixture.exchangeClient, { withdraw3 });
      fixture.exchangeClient.sendAsset.mockImplementation(signUserAction);
      return {
        ...fixture,
        withdraw3,
        lock: (): void => {
          signerReady = false;
        },
      };
    }

    it('fails a withdrawal with KEYRING_LOCKED without logging it', async () => {
      const { accountSignerProvider, accountSigner, withdraw3, lock } =
        createLockingProvider();
      await accountSignerProvider.getMarketDataWithPrices();
      const [{ assetId }] = accountSignerProvider.getWithdrawalRoutes();
      lock();

      const result = await accountSignerProvider.withdraw({
        amount: '10',
        destination: ACCOUNT_ADDRESS,
        assetId,
      });

      expect(result).toStrictEqual({
        success: false,
        error: PERPS_ERROR_CODES.KEYRING_LOCKED,
      });
      expect(withdraw3.mock.calls).toStrictEqual([
        [{ destination: ACCOUNT_ADDRESS, amount: '10' }],
      ]);
      expect(accountSigner.signTypedData).not.toHaveBeenCalled();
      expect(loggerError).not.toHaveBeenCalled();
    });

    it('fails a transfer between DEXs with KEYRING_LOCKED without logging it', async () => {
      const { accountSignerProvider, accountSigner, exchangeClient, lock } =
        createLockingProvider();
      await accountSignerProvider.getMarketDataWithPrices();
      lock();

      const result = await accountSignerProvider.transferBetweenDexs({
        sourceDex: '',
        destinationDex: 'xyz',
        amount: '10',
      });

      expect(result).toStrictEqual({
        success: false,
        error: PERPS_ERROR_CODES.KEYRING_LOCKED,
      });
      expect(exchangeClient.sendAsset.mock.calls).toStrictEqual([
        [
          {
            destination: ACCOUNT_ADDRESS,
            sourceDex: '',
            destinationDex: 'xyz',
            token: 'USDC:0xdef456',
            amount: '10',
          },
        ],
      ]);
      expect(accountSigner.signTypedData).not.toHaveBeenCalled();
      expect(loggerError).not.toHaveBeenCalled();
    });
  });

  describe('prepareTradingWallet', () => {
    it('runs the deferred migration and referral, finds the builder fee approved, and reports ready', async () => {
      const {
        accountSignerProvider,
        accountSigner,
        exchangeClient,
        infoClient,
      } = createAccountSignerProvider({
        signer: { requiresSignatureConfirmation: () => true },
      });
      await accountSignerProvider.getMarketDataWithPrices();

      const result = await accountSignerProvider.prepareTradingWallet();

      expect(result).toStrictEqual({ ready: true });
      expect(exchangeClient.userSetAbstraction.mock.calls).toStrictEqual([
        MIGRATION_WRITE,
      ]);
      expect(exchangeClient.setReferrer.mock.calls).toStrictEqual([
        REFERRAL_WRITE,
      ]);
      expect(accountSigner.signTypedData.mock.calls).toStrictEqual([
        [ACCOUNT_ADDRESS, USER_SIGNED_PAYLOAD],
        [ACCOUNT_ADDRESS, L1_PAYLOAD],
      ]);
      // Already approved, so nothing is signed for it.
      expect(infoClient.maxBuilderFee.mock.calls).toStrictEqual([
        [{ user: ACCOUNT_ADDRESS, builder: BUILDER_FEE_CONFIG.MainnetBuilder }],
      ]);
      expect(exchangeClient.approveBuilderFee).not.toHaveBeenCalled();
    });

    it('signs every setup step, so the first order signs only itself', async () => {
      const {
        accountSignerProvider,
        accountSigner,
        exchangeClient,
        infoClient,
      } = createAccountSignerProvider({
        signer: { requiresSignatureConfirmation: () => true },
      });
      await accountSignerProvider.getMarketDataWithPrices();
      // Not approved yet; the venue reports the approval once signed.
      infoClient.maxBuilderFee.mockResolvedValueOnce(0);

      const result = await accountSignerProvider.prepareTradingWallet();
      const setupSignatures = accountSigner.signTypedData.mock.calls.slice();
      accountSigner.signTypedData.mockClear();
      const order = await accountSignerProvider.placeOrder({
        symbol: 'BTC',
        isBuy: true,
        size: '0.1',
        orderType: 'market',
        currentPrice: 50000,
      });

      expect(result).toStrictEqual({ ready: true });
      // Migration, referral, builder fee approval.
      expect(setupSignatures).toStrictEqual([
        [ACCOUNT_ADDRESS, USER_SIGNED_PAYLOAD],
        [ACCOUNT_ADDRESS, L1_PAYLOAD],
        [ACCOUNT_ADDRESS, APPROVE_BUILDER_FEE_PAYLOAD],
      ]);
      expect(order).toStrictEqual({
        success: true,
        orderId: '123',
        submittedSize: '0.1',
        averagePrice: undefined,
        filledSize: undefined,
      });
      expect(accountSigner.signTypedData.mock.calls).toStrictEqual([
        [ACCOUNT_ADDRESS, L1_PAYLOAD],
      ]);
      expect(exchangeClient.userSetAbstraction.mock.calls).toStrictEqual([
        MIGRATION_WRITE,
      ]);
      expect(exchangeClient.approveBuilderFee.mock.calls).toStrictEqual([
        BUILDER_FEE_WRITE,
      ]);
      expect(exchangeClient.setReferrer.mock.calls).toStrictEqual([
        REFERRAL_WRITE,
      ]);
    });

    /**
     * Have another provider hold the real referral lock until released.
     *
     * @param waiters - How many lookups must find the lock before `waiting`
     * resolves.
     * @returns Resolves once that many providers found the lock and wait on
     * it, the number of lookups that found it, and the release.
     */
    function holdReferralLock(waiters = 1): {
      waiting: Promise<void>;
      lookupsWhileHeld: () => number;
      release: () => void;
    } {
      const release = PerpsSigningCache.setInFlight(
        'referral',
        'mainnet',
        ACCOUNT_ADDRESS,
      );
      const waiting = createDeferred<void>();
      let lookupsWhileHeld = 0;
      const isInFlight = PerpsSigningCache.isInFlight.bind(PerpsSigningCache);
      // Only observes the lookup: the lock and its answer are real.
      jest
        .spyOn(PerpsSigningCache, 'isInFlight')
        .mockImplementation((operationType, network, userAddress) => {
          const pending = isInFlight(operationType, network, userAddress);
          if (operationType === 'referral' && pending) {
            lookupsWhileHeld += 1;
            if (lookupsWhileHeld >= waiters) {
              waiting.resolve();
            }
          }
          return pending;
        });
      return {
        waiting: waiting.promise,
        lookupsWhileHeld: (): number => lookupsWhileHeld,
        release,
      };
    }

    it('makes its own referral attempt when another provider ended without a result', async () => {
      const { accountSignerProvider, exchangeClient } =
        createAccountSignerProvider({ abstraction: 'unifiedAccount' });
      const lock = holdReferralLock();

      let referrerCallsWhileWaiting;
      let result;
      try {
        const preparing = accountSignerProvider.prepareTradingWallet();
        await lock.waiting;
        // A provider that did not wait would reach its write by now.
        await new Promise((resolve) => setTimeout(resolve, 0));
        referrerCallsWhileWaiting =
          exchangeClient.setReferrer.mock.calls.length;
        lock.release();
        result = await preparing;
      } finally {
        // Never leak the global lock into later tests.
        lock.release();
      }

      expect(referrerCallsWhileWaiting).toBe(0);
      expect(exchangeClient.setReferrer.mock.calls).toStrictEqual([
        REFERRAL_WRITE,
      ]);
      expect(
        PerpsSigningCache.getReferral('mainnet', ACCOUNT_ADDRESS),
      ).toStrictEqual({
        attempted: true,
        success: true,
      });
      expect(result).toStrictEqual({ ready: true });
    });

    it('uses the referral result another provider cached while it waited', async () => {
      const { accountSignerProvider, exchangeClient } =
        createAccountSignerProvider({ abstraction: 'unifiedAccount' });
      const lock = holdReferralLock();

      let result;
      try {
        const preparing = accountSignerProvider.prepareTradingWallet();
        await lock.waiting;
        PerpsSigningCache.setReferral('mainnet', ACCOUNT_ADDRESS, {
          attempted: true,
          success: true,
        });
        lock.release();
        result = await preparing;
      } finally {
        lock.release();
      }

      expect(exchangeClient.setReferrer).not.toHaveBeenCalled();
      expect(result).toStrictEqual({ ready: true });
    });

    it('lets only one of several waiting providers make the referral attempt', async () => {
      const first = createAccountSignerProvider({
        abstraction: 'unifiedAccount',
      });
      const second = createAccountSignerProvider({
        abstraction: 'unifiedAccount',
      });
      const lock = holdReferralLock(2);

      let results;
      let waitersAtRelease;
      try {
        const preparing = [
          first.accountSignerProvider.prepareTradingWallet(),
          second.accountSignerProvider.prepareTradingWallet(),
        ];
        // Both providers found the lock and wait on it.
        await lock.waiting;
        waitersAtRelease = lock.lookupsWhileHeld();
        lock.release();
        results = await Promise.all(preparing);
      } finally {
        lock.release();
      }

      expect(waitersAtRelease).toBe(2);

      // One referral write across both providers.
      expect(
        [first, second].flatMap(
          ({ exchangeClient }): unknown[] =>
            exchangeClient.setReferrer.mock.calls,
        ),
      ).toStrictEqual([REFERRAL_WRITE]);
      expect(results).toStrictEqual([{ ready: true }, { ready: true }]);
    });

    it('signs nothing more when called again', async () => {
      jest.spyOn(Date, 'now').mockReturnValue(NOW);
      const { accountSignerProvider, accountSigner } =
        createAccountSignerProvider({
          signer: { requiresSignatureConfirmation: () => true },
        });
      await accountSignerProvider.prepareTradingWallet();
      const firstSignatures = accountSigner.signTypedData.mock.calls.slice();

      const result = await accountSignerProvider.prepareTradingWallet();

      expect(result).toStrictEqual({ ready: true });
      expect(
        TradingReadinessCache.get('mainnet', ACCOUNT_ADDRESS),
      ).toStrictEqual({
        attempted: true,
        enabled: true,
        reason: undefined,
        timestamp: NOW,
      });
      // Migration, then referral; nothing on the second call.
      expect(firstSignatures).toStrictEqual([
        [ACCOUNT_ADDRESS, USER_SIGNED_PAYLOAD],
        [ACCOUNT_ADDRESS, L1_PAYLOAD],
      ]);
      expect(accountSigner.signTypedData.mock.calls).toStrictEqual(
        firstSignatures,
      );
    });

    it('reports ready after the user declines the migration, since it is not asked again', async () => {
      jest.spyOn(Date, 'now').mockReturnValue(NOW);
      const { accountSignerProvider, accountSigner } =
        createAccountSignerProvider({
          signer: { requiresSignatureConfirmation: () => true },
        });
      accountSigner.signTypedData.mockImplementation(
        async (_address: string, payload: PerpsTypedDataPayload) => {
          if (payload === USER_SIGNED_PAYLOAD) {
            throw new Error('User rejected the request.');
          }
          return MAIN_SIGNATURE;
        },
      );

      const result = await accountSignerProvider.prepareTradingWallet();
      const secondResult = await accountSignerProvider.prepareTradingWallet();

      expect(result).toStrictEqual({ ready: true });
      expect(secondResult).toStrictEqual({ ready: true });
      expect(
        TradingReadinessCache.get('mainnet', ACCOUNT_ADDRESS),
      ).toStrictEqual({
        attempted: true,
        enabled: false,
        reason: undefined,
        timestamp: NOW,
      });
      // Declined once, not asked again.
      expect(
        accountSigner.signTypedData.mock.calls.filter(
          ([, payload]) => payload === USER_SIGNED_PAYLOAD,
        ),
      ).toHaveLength(1);
    });

    it('reports not ready when the builder fee approval is rejected', async () => {
      const { accountSignerProvider, exchangeClient, infoClient } =
        createAccountSignerProvider({ abstraction: 'unifiedAccount' });
      infoClient.maxBuilderFee.mockResolvedValue(0);
      exchangeClient.approveBuilderFee.mockRejectedValue(
        new Error('User rejected the request.'),
      );

      const result = await accountSignerProvider.prepareTradingWallet();

      expect(result).toStrictEqual({ ready: false });
      expect(exchangeClient.approveBuilderFee.mock.calls).toStrictEqual([
        BUILDER_FEE_WRITE,
      ]);
    });

    it('reports KEYRING_LOCKED when accountSigner is not ready, without running or logging setup', async () => {
      const {
        accountSignerProvider,
        accountSigner,
        exchangeClient,
        initialize,
      } = createAccountSignerProvider({
        signer: { isReady: () => false },
      });

      const result = await accountSignerProvider.prepareTradingWallet();

      expect(result).toStrictEqual({
        ready: false,
        error: PERPS_ERROR_CODES.KEYRING_LOCKED,
      });
      expect(initialize).not.toHaveBeenCalled();
      expect(accountSigner.signTypedData).not.toHaveBeenCalled();
      expect(exchangeClient.userSetAbstraction).not.toHaveBeenCalled();
      expect(exchangeClient.setReferrer).not.toHaveBeenCalled();
      expect(loggerError).not.toHaveBeenCalled();
      expect(migrationAttempted()).toBe(false);
      expect(referralAttempted()).toBe(false);
    });

    it('reports and logs the error when the clients cannot initialize', async () => {
      const { accountSignerProvider, initialize } =
        createAccountSignerProvider();
      const failure = new Error('transport unavailable');
      initialize.mockRejectedValue(failure);

      const result = await accountSignerProvider.prepareTradingWallet();

      expect(result).toStrictEqual({
        ready: false,
        error: 'transport unavailable',
      });
      expect(loggerError.mock.calls).toStrictEqual([
        [
          failure,
          {
            tags: {
              feature: PERPS_CONSTANTS.FeatureName,
              provider: 'hyperliquid',
              network: 'mainnet',
            },
            context: {
              name: 'HyperLiquidProvider',
              data: { method: 'prepareTradingWallet' },
            },
          },
        ],
      ]);
    });

    it('does not log a provider replaced during preparation', async () => {
      const { accountSignerProvider, initialize } =
        createAccountSignerProvider();
      initialize.mockRejectedValue(
        new Error(PERPS_ERROR_CODES.PROVIDER_LIFECYCLE_STALE),
      );

      const result = await accountSignerProvider.prepareTradingWallet();

      expect(result).toStrictEqual({
        ready: false,
        error: PERPS_ERROR_CODES.PROVIDER_LIFECYCLE_STALE,
      });
      expect(loggerError).not.toHaveBeenCalled();
    });

    it('signs the migration at connect and the referral in preparation through the keyring without accountSigner', async () => {
      const { accountSignerProvider, accountSigner, call, exchangeClient } =
        createAccountSignerProvider({ keyring: true });
      const typedDataSignatures = (): unknown[] =>
        call.mock.calls.filter(
          ([action]) => action === 'KeyringController:signTypedMessage',
        );

      // A software keyring is not deferred: the migration signs at connect.
      await accountSignerProvider.getMarketDataWithPrices();
      const connectSignatures = typedDataSignatures();
      call.mockClear();
      const result = await accountSignerProvider.prepareTradingWallet();

      expect(result).toStrictEqual({ ready: true });
      expect(exchangeClient.userSetAbstraction.mock.calls).toStrictEqual([
        MIGRATION_WRITE,
      ]);
      expect(exchangeClient.setReferrer.mock.calls).toStrictEqual([
        REFERRAL_WRITE,
      ]);
      expect(accountSigner.signTypedData).not.toHaveBeenCalled();
      expect(connectSignatures).toStrictEqual([
        [
          'KeyringController:signTypedMessage',
          { from: ACCOUNT_ADDRESS, data: USER_SIGNED_PAYLOAD },
          'V4',
        ],
      ]);
      expect(typedDataSignatures()).toStrictEqual([
        [
          'KeyringController:signTypedMessage',
          { from: ACCOUNT_ADDRESS, data: L1_PAYLOAD },
          'V4',
        ],
      ]);
    });

    it('attempts the referral again when the signer locks while signing it', async () => {
      let signerReady = true;
      const { accountSignerProvider, accountSigner, exchangeClient } =
        createAccountSignerProvider({
          abstraction: 'unifiedAccount',
          signer: { isReady: () => signerReady },
        });
      // The host's signer locks while signing and throws its own error.
      accountSigner.signTypedData.mockImplementationOnce(async () => {
        signerReady = false;
        throw new Error('Wallet is locked');
      });

      const lockedResult = await accountSignerProvider.prepareTradingWallet();
      const referralAfterLock = referralAttempted();
      signerReady = true;
      const retriedResult = await accountSignerProvider.prepareTradingWallet();

      expect(lockedResult).toStrictEqual({
        ready: false,
        error: PERPS_ERROR_CODES.KEYRING_LOCKED,
      });
      expect(referralAfterLock).toBe(false);
      expect(retriedResult).toStrictEqual({ ready: true });
      expect(exchangeClient.setReferrer.mock.calls).toStrictEqual([
        REFERRAL_WRITE,
        REFERRAL_WRITE,
      ]);
      expect(referralAttempted()).toBe(true);
      expect(loggerError).not.toHaveBeenCalled();
    });

    it('reports KEYRING_LOCKED without logging when the signer locks while a step fails', async () => {
      let signerReady = true;
      const { accountSignerProvider, initialize } = createAccountSignerProvider(
        { signer: { isReady: () => signerReady } },
      );
      initialize.mockImplementation(async () => {
        signerReady = false;
        throw new Error('wallet disconnected');
      });

      const result = await accountSignerProvider.prepareTradingWallet();

      expect(result).toStrictEqual({
        ready: false,
        error: PERPS_ERROR_CODES.KEYRING_LOCKED,
      });
      expect(loggerError).not.toHaveBeenCalled();
    });

    it('reports KEYRING_LOCKED when the signer locks while setup signs', async () => {
      let signerReady = true;
      const { accountSignerProvider, accountSigner } =
        createAccountSignerProvider({
          abstraction: 'unifiedAccount',
          signer: { isReady: () => signerReady },
        });
      // The referral signs, then the signer locks before setup ends.
      accountSigner.signTypedData.mockImplementation(async () => {
        signerReady = false;
        return MAIN_SIGNATURE;
      });

      const result = await accountSignerProvider.prepareTradingWallet();

      expect(result).toStrictEqual({
        ready: false,
        error: PERPS_ERROR_CODES.KEYRING_LOCKED,
      });
      expect(accountSigner.signTypedData.mock.calls).toStrictEqual([
        [ACCOUNT_ADDRESS, L1_PAYLOAD],
      ]);
      expect(loggerError).not.toHaveBeenCalled();
    });

    it('reports not ready, without an error, while only the migration needs another attempt', async () => {
      const { accountSignerProvider, exchangeClient } =
        createAccountSignerProvider({ abstraction: 'default' });
      exchangeClient.agentSetAbstraction.mockRejectedValue(
        new Error(PERPS_ERROR_CODES.KEYRING_LOCKED),
      );

      const result = await accountSignerProvider.prepareTradingWallet();

      expect(result).toStrictEqual({ ready: false });
      expect(migrationAttempted()).toBe(false);
      expect(referralAttempted()).toBe(true);
      expect(exchangeClient.setReferrer.mock.calls).toStrictEqual([
        REFERRAL_WRITE,
      ]);
      expect(loggerError).not.toHaveBeenCalled();
    });

    it('reports not ready, without an error, for a wallet with no HyperLiquid account yet', async () => {
      const { accountSignerProvider, accountSigner, exchangeClient } =
        createAccountSignerProvider({
          abstraction: 'default',
          info: {
            userNonFundingLedgerUpdates: jest.fn().mockResolvedValue([]),
            // Not approved: the venue would reject the approval anyway.
            maxBuilderFee: jest.fn().mockResolvedValue(0),
          },
        });

      const result = await accountSignerProvider.prepareTradingWallet();

      expect(result).toStrictEqual({ ready: false });
      expect(exchangeClient.agentSetAbstraction).not.toHaveBeenCalled();
      expect(exchangeClient.setReferrer).not.toHaveBeenCalled();
      expect(exchangeClient.approveBuilderFee).not.toHaveBeenCalled();
      expect(accountSigner.signTypedData).not.toHaveBeenCalled();
      expect(loggerError).not.toHaveBeenCalled();
    });

    it('reports NO_ACCOUNT_SELECTED without logging when no account is selected', async () => {
      const { accountSignerProvider, accountSigner, selectAccount } =
        createAccountSignerProvider({ abstraction: 'unifiedAccount' });
      await accountSignerProvider.getMarketDataWithPrices();
      // An empty selection: the wallet service finds no account.
      selectAccount('' as Hex);

      const result = await accountSignerProvider.prepareTradingWallet();

      expect(result).toStrictEqual({
        ready: false,
        error: PERPS_ERROR_CODES.NO_ACCOUNT_SELECTED,
      });
      expect(accountSigner.signTypedData).not.toHaveBeenCalled();
      expect(loggerError).not.toHaveBeenCalled();
    });

    it('reports KEYRING_LOCKED once the signer locks, even after setup completed', async () => {
      let signerReady = true;
      const { accountSignerProvider } = createAccountSignerProvider({
        abstraction: 'unifiedAccount',
        signer: { isReady: () => signerReady },
      });
      const firstResult = await accountSignerProvider.prepareTradingWallet();

      signerReady = false;
      const lockedResult = await accountSignerProvider.prepareTradingWallet();

      expect(firstResult).toStrictEqual({ ready: true });
      expect(lockedResult).toStrictEqual({
        ready: false,
        error: PERPS_ERROR_CODES.KEYRING_LOCKED,
      });
    });
  });

  describe('with an agent', () => {
    const MAINNET_ACCOUNT = {
      mainAddress: ACCOUNT_ADDRESS,
      isTestnet: false,
    } as const;

    /**
     * Bind an agent the way PerpsController.setAgentSigner does: record the
     * binding, then drop the agents the provider already resolved.
     *
     * @param provider - The provider signing L1 actions.
     * @param bindings - The bindings its resolver reads.
     * @param account - The main account and network.
     * @param agentSigner - The agent, or null to pin the main account.
     */
    function bind(
      provider: HyperLiquidProvider,
      bindings: AgentBindings,
      account: PerpsAgentAccount,
      agentSigner: PerpsAgentSigner | null,
    ): void {
      bindings.set(account, agentSigner);
      provider.clearAgentSigners();
    }

    it('resolves the agent at the first L1 signature and signs with it', async () => {
      const getAgentSigner = jest.fn();
      const { accountSignerProvider, accountSigner, agentSigner, initialize } =
        createAccountSignerProvider({
          abstraction: 'default',
          getAgentSigner,
        });
      getAgentSigner.mockResolvedValue(agentSigner);

      await accountSignerProvider.getMarketDataWithPrices();

      expect(getAgentSigner.mock.calls).toStrictEqual([[MAINNET_ACCOUNT]]);
      expect(initialize.mock.calls[0][0].address).toBe(ACCOUNT_ADDRESS);
      expect(agentSigner.signTypedData.mock.calls).toStrictEqual([
        [L1_PAYLOAD],
      ]);
      expect(accountSigner.signTypedData).not.toHaveBeenCalled();
    });

    it('keeps a resolved agent for later L1 actions', async () => {
      const getAgentSigner = jest.fn();
      const { accountSignerProvider, agentSigner } =
        createAccountSignerProvider({
          abstraction: 'default',
          getAgentSigner,
        });
      getAgentSigner.mockResolvedValue(agentSigner);

      await accountSignerProvider.getMarketDataWithPrices();
      await accountSignerProvider.prepareTradingWallet();

      // Migration at connect, then referral setup.
      expect(getAgentSigner.mock.calls).toStrictEqual([[MAINNET_ACCOUNT]]);
      expect(agentSigner.signTypedData.mock.calls).toStrictEqual([
        [L1_PAYLOAD],
        [L1_PAYLOAD],
      ]);
    });

    it('asks again after a null answer', async () => {
      const getAgentSigner = jest.fn();
      const { accountSignerProvider, accountSigner, agentSigner } =
        createAccountSignerProvider({
          abstraction: 'default',
          getAgentSigner,
        });
      getAgentSigner
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(agentSigner);

      await accountSignerProvider.getMarketDataWithPrices();
      await accountSignerProvider.prepareTradingWallet();

      expect(getAgentSigner.mock.calls).toStrictEqual([
        [MAINNET_ACCOUNT],
        [MAINNET_ACCOUNT],
      ]);
      expect(accountSigner.signTypedData.mock.calls).toStrictEqual([
        [ACCOUNT_ADDRESS, L1_PAYLOAD],
      ]);
      expect(agentSigner.signTypedData.mock.calls).toStrictEqual([
        [L1_PAYLOAD],
      ]);
    });

    it('does not ask for an agent when nothing is signed', async () => {
      const getAgentSigner = jest.fn();
      const { accountSignerProvider } = createAccountSignerProvider({
        abstraction: 'unifiedAccount',
        getAgentSigner,
      });

      await accountSignerProvider.getMarketDataWithPrices();

      expect(getAgentSigner).not.toHaveBeenCalled();
    });

    it('keeps user-signed actions on the main account', async () => {
      const getAgentSigner = jest.fn();
      const { accountSignerProvider, accountSigner, agentSigner } =
        createAccountSignerProvider({ getAgentSigner });
      getAgentSigner.mockResolvedValue(agentSigner);

      await accountSignerProvider.getMarketDataWithPrices();

      expect(accountSigner.signTypedData.mock.calls).toStrictEqual([
        [ACCOUNT_ADDRESS, USER_SIGNED_PAYLOAD],
      ]);
      expect(agentSigner.signTypedData).not.toHaveBeenCalled();
      expect(getAgentSigner).not.toHaveBeenCalled();
    });

    it('fails only the L1 actions and asks again when getAgentSigner rejects', async () => {
      const getAgentSigner = jest
        .fn()
        .mockRejectedValue(new Error('agent store unavailable'));
      const {
        accountSignerProvider,
        accountSigner,
        exchangeClient,
        infoClient,
      } = createAccountSignerProvider({
        abstraction: 'default',
        getAgentSigner,
      });
      // Not approved yet: the approval is a user-signed write.
      infoClient.maxBuilderFee.mockResolvedValueOnce(0);

      const marketData = await accountSignerProvider.getMarketDataWithPrices();
      const result = await accountSignerProvider.prepareTradingWallet();

      expect(marketData).toHaveLength(2);
      // A failed silent migration is retried: at connect, when prepare
      // re-runs the connect steps, and once more by the trading setup; the
      // referral write is the fourth L1 action. Each asks getAgentSigner.
      expect(exchangeClient.agentSetAbstraction.mock.calls).toStrictEqual([
        SILENT_MIGRATION_WRITE,
        SILENT_MIGRATION_WRITE,
        SILENT_MIGRATION_WRITE,
      ]);
      expect(exchangeClient.setReferrer.mock.calls).toStrictEqual([
        REFERRAL_WRITE,
      ]);
      expect(getAgentSigner.mock.calls).toStrictEqual([
        [MAINNET_ACCOUNT],
        [MAINNET_ACCOUNT],
        [MAINNET_ACCOUNT],
        [MAINNET_ACCOUNT],
      ]);
      // The user-signed builder fee approval still signs on the main account.
      expect(exchangeClient.approveBuilderFee.mock.calls).toStrictEqual([
        BUILDER_FEE_WRITE,
      ]);
      expect(accountSigner.signTypedData.mock.calls).toStrictEqual([
        [ACCOUNT_ADDRESS, APPROVE_BUILDER_FEE_PAYLOAD],
      ]);
      expect(result).toStrictEqual({ ready: false });
      // Retryable like a locked keyring: no failure metric, nothing logged.
      expect(trackPerpsEvent.mock.calls).toStrictEqual([
        [
          PerpsAnalyticsEvent.AccountSetup,
          {
            [PERPS_EVENT_PROPERTY.ABSTRACTION_MODE]: 'default',
            [PERPS_EVENT_PROPERTY.STATUS]:
              PERPS_EVENT_VALUE.STATUS.MIGRATION_REQUIRED,
          },
        ],
        [
          PerpsAnalyticsEvent.AccountSetup,
          {
            [PERPS_EVENT_PROPERTY.ABSTRACTION_MODE]: 'default',
            [PERPS_EVENT_PROPERTY.STATUS]:
              PERPS_EVENT_VALUE.STATUS.MIGRATION_REQUIRED,
          },
        ],
        [
          PerpsAnalyticsEvent.AccountSetup,
          {
            [PERPS_EVENT_PROPERTY.ABSTRACTION_MODE]: 'default',
            [PERPS_EVENT_PROPERTY.STATUS]:
              PERPS_EVENT_VALUE.STATUS.MIGRATION_REQUIRED,
          },
        ],
      ]);
      expect(loggerError).not.toHaveBeenCalled();
    });

    it('signs with the agent bound to the selected account', async () => {
      const bindings = new AgentBindings(undefined);
      const { accountSignerProvider, agentSigner } =
        createAccountSignerProvider({
          abstraction: 'default',
          getAgentSigner: bindings.resolve,
        });

      bindings.set(MAINNET_ACCOUNT, agentSigner);
      await accountSignerProvider.getMarketDataWithPrices();

      expect(agentSigner.signTypedData.mock.calls).toStrictEqual([
        [L1_PAYLOAD],
      ]);
    });

    it('binds the agent to the account it names, not the selected one', async () => {
      const bindings = new AgentBindings(undefined);
      const {
        accountSignerProvider,
        accountSigner,
        agentSigner,
        selectAccount,
      } = createAccountSignerProvider({
        abstraction: 'default',
        getAgentSigner: bindings.resolve,
      });

      bindings.set(
        { mainAddress: OTHER_ACCOUNT_ADDRESS, isTestnet: false },
        agentSigner,
      );
      await accountSignerProvider.getMarketDataWithPrices();
      selectAccount(OTHER_ACCOUNT_ADDRESS);
      await accountSignerProvider.prepareTradingWallet();

      // The selected account's migration signs on the main account; the
      // other account's L1 actions sign with its agent.
      expect(accountSigner.signTypedData.mock.calls).toStrictEqual([
        [ACCOUNT_ADDRESS, L1_PAYLOAD],
      ]);
      expect(agentSigner.signTypedData.mock.calls).toStrictEqual([
        [L1_PAYLOAD],
        [L1_PAYLOAD],
      ]);
    });

    it('never signs on another network with the agent bound for mainnet', async () => {
      const bindings = new AgentBindings(undefined);
      const { accountSignerProvider, accountSigner, agentSigner } =
        createAccountSignerProvider({
          abstraction: 'default',
          getAgentSigner: bindings.resolve,
        });
      bindings.set(MAINNET_ACCOUNT, agentSigner);

      mockClientService.isTestnetMode.mockReturnValue(true);
      await accountSignerProvider.getMarketDataWithPrices();

      expect(agentSigner.signTypedData).not.toHaveBeenCalled();
      expect(accountSigner.signTypedData.mock.calls).toStrictEqual([
        [ACCOUNT_ADDRESS, L1_PAYLOAD],
      ]);
    });

    it('pins the main account with a null binding without asking getAgentSigner', async () => {
      const getAgentSigner = jest.fn();
      const bindings = new AgentBindings(getAgentSigner);
      const { accountSignerProvider, accountSigner, agentSigner } =
        createAccountSignerProvider({
          abstraction: 'default',
          getAgentSigner: bindings.resolve,
        });
      getAgentSigner.mockResolvedValue(agentSigner);

      bindings.set(MAINNET_ACCOUNT, null);
      await accountSignerProvider.getMarketDataWithPrices();
      await accountSignerProvider.prepareTradingWallet();

      expect(getAgentSigner).not.toHaveBeenCalled();
      expect(agentSigner.signTypedData).not.toHaveBeenCalled();
      // Migration, then referral.
      expect(accountSigner.signTypedData.mock.calls).toStrictEqual([
        [ACCOUNT_ADDRESS, L1_PAYLOAD],
        [ACCOUNT_ADDRESS, L1_PAYLOAD],
      ]);
    });

    it('lets a pin made while getAgentSigner is pending win', async () => {
      const { getAgentSigner, answer, asked } = createPendingResolver();
      const bindings = new AgentBindings(getAgentSigner);
      const { accountSignerProvider, accountSigner, agentSigner } =
        createAccountSignerProvider({
          abstraction: 'default',
          getAgentSigner: bindings.resolve,
        });

      const reading = accountSignerProvider.getMarketDataWithPrices();
      await asked;
      bind(accountSignerProvider, bindings, MAINNET_ACCOUNT, null);
      answer.resolve(agentSigner);
      await reading;

      expect(agentSigner.signTypedData).not.toHaveBeenCalled();
      expect(accountSigner.signTypedData.mock.calls).toStrictEqual([
        [ACCOUNT_ADDRESS, L1_PAYLOAD],
      ]);
    });

    it('keeps an agent bound while a failing getAgentSigner answer is pending', async () => {
      const { getAgentSigner, answer, asked } = createPendingResolver();
      const bindings = new AgentBindings(getAgentSigner);
      const { accountSignerProvider, agentSigner } =
        createAccountSignerProvider({
          abstraction: 'default',
          getAgentSigner: bindings.resolve,
        });

      const reading = accountSignerProvider.getMarketDataWithPrices();
      await asked;
      bind(accountSignerProvider, bindings, MAINNET_ACCOUNT, agentSigner);
      answer.reject(new Error('agent store unavailable'));
      await reading;
      await accountSignerProvider.prepareTradingWallet();

      expect(getAgentSigner.mock.calls).toStrictEqual([[MAINNET_ACCOUNT]]);
      expect(agentSigner.signTypedData.mock.calls).toStrictEqual([
        [L1_PAYLOAD],
        [L1_PAYLOAD],
      ]);
    });

    it('asks getAgentSigner with the network of the provider', async () => {
      const getAgentSigner = jest.fn().mockResolvedValue(null);
      const { accountSignerProvider } = createAccountSignerProvider({
        abstraction: 'default',
        getAgentSigner,
      });
      mockClientService.isTestnetMode.mockReturnValue(true);

      await accountSignerProvider.getMarketDataWithPrices();

      expect(getAgentSigner.mock.calls).toStrictEqual([
        [{ mainAddress: ACCOUNT_ADDRESS, isTestnet: true }],
      ]);
    });

    it('does not reuse the mainnet agent after the provider switches to testnet', async () => {
      const getAgentSigner = jest.fn();
      const { accountSignerProvider, accountSigner, agentSigner, initialize } =
        createAccountSignerProvider({
          abstraction: 'unifiedAccount',
          getAgentSigner,
        });
      // An agent is approved on mainnet only.
      getAgentSigner.mockImplementation(async (account: PerpsAgentAccount) =>
        account.isTestnet ? null : agentSigner,
      );
      await accountSignerProvider.getMarketDataWithPrices();
      const [[wallet]] = initialize.mock.calls;
      await wallet.signTypedData(L1_PAYLOAD);

      mockClientService.isTestnetMode.mockReturnValue(true);
      await wallet.signTypedData(L1_PAYLOAD);

      expect(getAgentSigner.mock.calls).toStrictEqual([
        [MAINNET_ACCOUNT],
        [{ mainAddress: ACCOUNT_ADDRESS, isTestnet: true }],
      ]);
      expect(agentSigner.signTypedData.mock.calls).toStrictEqual([
        [L1_PAYLOAD],
      ]);
      // The testnet action signs on the main account.
      expect(accountSigner.signTypedData.mock.calls).toStrictEqual([
        [ACCOUNT_ADDRESS, L1_PAYLOAD],
      ]);
    });

    it('signs with the main account while getAgentSigner answers null, and with the agent once it answers again', async () => {
      const getAgentSigner = jest.fn();
      const { accountSignerProvider, accountSigner, agentSigner, initialize } =
        createAccountSignerProvider({
          abstraction: 'unifiedAccount',
          getAgentSigner,
        });
      getAgentSigner.mockResolvedValue(agentSigner);
      await accountSignerProvider.getMarketDataWithPrices();
      const [[wallet]] = initialize.mock.calls;

      await wallet.signTypedData(L1_PAYLOAD);
      getAgentSigner.mockResolvedValue(null);
      accountSignerProvider.clearAgentSigners();
      await wallet.signTypedData(L1_PAYLOAD);
      getAgentSigner.mockResolvedValue(agentSigner);
      await wallet.signTypedData(L1_PAYLOAD);

      expect(agentSigner.signTypedData.mock.calls).toStrictEqual([
        [L1_PAYLOAD],
        [L1_PAYLOAD],
      ]);
      expect(accountSigner.signTypedData.mock.calls).toStrictEqual([
        [ACCOUNT_ADDRESS, L1_PAYLOAD],
      ]);
      expect(getAgentSigner.mock.calls).toStrictEqual([
        [MAINNET_ACCOUNT],
        [MAINNET_ACCOUNT],
        [MAINNET_ACCOUNT],
      ]);
    });

    it('asks getAgentSigner again once the bindings are cleared', async () => {
      const getAgentSigner = jest.fn();
      const bindings = new AgentBindings(getAgentSigner);
      const { accountSignerProvider, agentSigner, initialize } =
        createAccountSignerProvider({
          abstraction: 'unifiedAccount',
          getAgentSigner: bindings.resolve,
        });
      getAgentSigner.mockResolvedValue(agentSigner);
      bindings.set(MAINNET_ACCOUNT, null);
      await accountSignerProvider.getMarketDataWithPrices();
      const [[wallet]] = initialize.mock.calls;

      bindings.clear();
      accountSignerProvider.clearAgentSigners();
      await wallet.signTypedData(L1_PAYLOAD);

      expect(getAgentSigner.mock.calls).toStrictEqual([[MAINNET_ACCOUNT]]);
      expect(agentSigner.signTypedData.mock.calls).toStrictEqual([
        [L1_PAYLOAD],
      ]);
    });

    it('leaves the referral to retry, unrecorded, when getAgentSigner rejects', async () => {
      const getAgentSigner = jest
        .fn()
        .mockRejectedValue(new Error('agent store unavailable'));
      const { accountSignerProvider, exchangeClient } =
        createAccountSignerProvider({
          abstraction: 'unifiedAccount',
          getAgentSigner,
        });

      await accountSignerProvider.prepareTradingWallet();

      expect(exchangeClient.setReferrer.mock.calls).toStrictEqual([
        REFERRAL_WRITE,
      ]);
      expect(referralAttempted()).toBe(false);
      expect(loggerError).not.toHaveBeenCalled();
    });

    it('leaves the referral to retry, unrecorded, when the agent fails to sign', async () => {
      const getAgentSigner = jest.fn();
      const { accountSignerProvider, agentSigner, exchangeClient, initialize } =
        createAccountSignerProvider({
          abstraction: 'unifiedAccount',
          getAgentSigner,
        });
      agentSigner.signTypedData.mockRejectedValue(
        new Error('agent key locked'),
      );
      getAgentSigner.mockResolvedValue(agentSigner);

      const result = await accountSignerProvider.prepareTradingWallet();
      const [[wallet]] = initialize.mock.calls;
      const nextSigning = await wallet
        .signTypedData(L1_PAYLOAD)
        .catch((error: unknown) => error);

      expect(result).toStrictEqual({ ready: false });
      expect(exchangeClient.setReferrer.mock.calls).toStrictEqual([
        REFERRAL_WRITE,
      ]);
      expect(referralAttempted()).toBe(false);
      // The agent stays in use: the next L1 action asks it again, not the host.
      expect(nextSigning).toBeInstanceOf(AgentSignerUnavailableError);
      expect(agentSigner.signTypedData.mock.calls).toStrictEqual([
        [L1_PAYLOAD],
        [L1_PAYLOAD],
      ]);
      expect(getAgentSigner.mock.calls).toStrictEqual([[MAINNET_ACCOUNT]]);
      expect(loggerError).not.toHaveBeenCalled();
    });

    it('treats a getAgentSigner that throws synchronously like a rejection', async () => {
      const getAgentSigner = jest.fn(() => {
        throw new Error('agent store unavailable');
      });
      const { accountSignerProvider, accountSigner, initialize } =
        createAccountSignerProvider({
          abstraction: 'unifiedAccount',
          getAgentSigner,
        });
      await accountSignerProvider.getMarketDataWithPrices();
      const [[wallet]] = initialize.mock.calls;

      await expect(wallet.signTypedData(L1_PAYLOAD)).rejects.toBeInstanceOf(
        AgentSignerUnavailableError,
      );
      await expect(wallet.signTypedData(L1_PAYLOAD)).rejects.toBeInstanceOf(
        AgentSignerUnavailableError,
      );
      expect(getAgentSigner.mock.calls).toStrictEqual([
        [MAINNET_ACCOUNT],
        [MAINNET_ACCOUNT],
      ]);
      expect(accountSigner.signTypedData).not.toHaveBeenCalled();
    });

    it('discards an answer pending across clearAgentSigners and asks again', async () => {
      const { getAgentSigner, answer, asked } = createPendingResolver();
      const { accountSignerProvider, accountSigner, agentSigner } =
        createAccountSignerProvider({
          abstraction: 'default',
          getAgentSigner,
        });

      const reading = accountSignerProvider.getMarketDataWithPrices();
      await asked;
      getAgentSigner.mockResolvedValue(null);
      accountSignerProvider.clearAgentSigners();
      answer.resolve(agentSigner);
      await reading;

      expect(getAgentSigner.mock.calls).toStrictEqual([
        [MAINNET_ACCOUNT],
        [MAINNET_ACCOUNT],
      ]);
      expect(agentSigner.signTypedData).not.toHaveBeenCalled();
      expect(accountSigner.signTypedData.mock.calls).toStrictEqual([
        [ACCOUNT_ADDRESS, L1_PAYLOAD],
      ]);
    });

    it('keeps trading setup retryable until the referral succeeds after getAgentSigner rejected', async () => {
      const getAgentSigner = jest
        .fn()
        .mockRejectedValueOnce(new Error('agent store unavailable'))
        .mockResolvedValue(null);
      const { accountSignerProvider, exchangeClient } =
        createAccountSignerProvider({
          abstraction: 'unifiedAccount',
          getAgentSigner,
        });

      const firstResult = await accountSignerProvider.prepareTradingWallet();
      const secondResult = await accountSignerProvider.prepareTradingWallet();

      expect(firstResult).toStrictEqual({ ready: false });
      expect(secondResult).toStrictEqual({ ready: true });
      expect(exchangeClient.setReferrer.mock.calls).toStrictEqual([
        REFERRAL_WRITE,
        REFERRAL_WRITE,
      ]);
    });

    const CHECKSUMMED_AGENT_ADDRESS =
      '0x00000000000000000000000000000000000A9E17' as const;

    const rejection = (address: string): Error =>
      new Error(`User or API Wallet ${address} does not exist.`);

    describe('when the venue rejects the agent', () => {
      // The position's take profit, resting on the venue.
      const TAKE_PROFIT_ORDER = createFrontendOpenOrder({
        side: 'A',
        limitPx: '58000',
        oid: 456,
        orderType: 'Take Profit Market',
        tif: null,
        isTrigger: true,
        triggerPx: '58000',
        triggerCondition: 'Price above 58000',
        reduceOnly: true,
        isPositionTpsl: true,
      });

      /**
       * A provider whose L1 writes are signed by the agent, then rejected
       * by the venue as an unknown wallet.
       *
       * @param write - The exchange write that fails.
       * @returns The provider, its mocks and the rejected agent.
       */
      function createRejectingProvider(
        write:
          | 'order'
          | 'cancel'
          | 'modify'
          | 'updateIsolatedMargin'
          | 'agentSetAbstraction'
          | 'setReferrer',
      ): AccountSignerFixture & {
        getAgentSigner: jest.Mock;
        onAgentRejected: jest.Mock;
      } {
        const getAgentSigner = jest.fn();
        const onAgentRejected = jest.fn();
        const built = createAccountSignerProvider({
          abstraction:
            write === 'agentSetAbstraction' ? 'default' : 'unifiedAccount',
          getAgentSigner,
          onAgentRejected,
        });
        getAgentSigner.mockResolvedValue(built.agentSigner);
        built.exchangeClient[write].mockImplementation(async () => {
          await built.initialize.mock.calls[0][0].signTypedData(L1_PAYLOAD);
          throw rejection(built.agentSigner.address);
        });
        return { ...built, getAgentSigner, onAgentRejected };
      }

      it('fails a cancel with KEYRING_LOCKED without logging it', async () => {
        const { accountSignerProvider, onAgentRejected } =
          createRejectingProvider('cancel');
        await accountSignerProvider.getMarketDataWithPrices();

        const result = await accountSignerProvider.cancelOrder({
          orderId: '123',
          symbol: 'BTC',
        });

        expect(result).toStrictEqual({
          success: false,
          orderId: '123',
          error: PERPS_ERROR_CODES.KEYRING_LOCKED,
        });
        expect(onAgentRejected.mock.calls).toStrictEqual([
          [MAINNET_ACCOUNT, AGENT_ADDRESS],
        ]);
        expect(loggerError).not.toHaveBeenCalled();
      });

      it('drops an agent the venue rejects in a cancel status entry', async () => {
        const {
          accountSignerProvider,
          agentSigner,
          exchangeClient,
          getAgentSigner,
          initialize,
          onAgentRejected,
        } = createRejectingProvider('cancel');
        await accountSignerProvider.getMarketDataWithPrices();
        const [[wallet]] = initialize.mock.calls;
        exchangeClient.cancel.mockImplementation(async () => {
          await wallet.signTypedData(L1_PAYLOAD);
          return {
            status: 'ok',
            response: {
              data: {
                statuses: [{ error: rejection(agentSigner.address).message }],
              },
            },
          };
        });

        const result = await accountSignerProvider.cancelOrder({
          orderId: '123',
          symbol: 'BTC',
        });
        await wallet.signTypedData(L1_PAYLOAD);

        expect(result).toStrictEqual({
          success: false,
          orderId: '123',
          error: PERPS_ERROR_CODES.KEYRING_LOCKED,
        });
        expect(onAgentRejected.mock.calls).toStrictEqual([
          [MAINNET_ACCOUNT, AGENT_ADDRESS],
        ]);
        // Dropped, so the next L1 action asks again.
        expect(getAgentSigner.mock.calls).toStrictEqual([
          [MAINNET_ACCOUNT],
          [MAINNET_ACCOUNT],
        ]);
        expect(loggerError).not.toHaveBeenCalled();
      });

      it('drops an agent the venue rejects in batch cancel status entries, and reports it once', async () => {
        const {
          accountSignerProvider,
          exchangeClient,
          getAgentSigner,
          initialize,
          onAgentRejected,
        } = createRejectingProvider('cancel');
        await accountSignerProvider.getMarketDataWithPrices();
        const [[wallet]] = initialize.mock.calls;
        exchangeClient.cancel.mockImplementation(async () => {
          await wallet.signTypedData(L1_PAYLOAD);
          return {
            status: 'ok',
            response: {
              data: {
                statuses: [
                  { error: rejection(AGENT_ADDRESS).message },
                  { error: rejection(AGENT_ADDRESS).message },
                ],
              },
            },
          };
        });

        const result = await accountSignerProvider.cancelOrders([
          { orderId: '123', symbol: 'BTC' },
          { orderId: '124', symbol: 'BTC' },
        ]);
        await wallet.signTypedData(L1_PAYLOAD);

        expect(result).toStrictEqual({
          success: false,
          successCount: 0,
          failureCount: 2,
          results: [
            {
              orderId: '123',
              symbol: 'BTC',
              success: false,
              error: PERPS_ERROR_CODES.KEYRING_LOCKED,
            },
            {
              orderId: '124',
              symbol: 'BTC',
              success: false,
              error: PERPS_ERROR_CODES.KEYRING_LOCKED,
            },
          ],
        });
        // One signed write, so the host is told once.
        expect(onAgentRejected.mock.calls).toStrictEqual([
          [MAINNET_ACCOUNT, AGENT_ADDRESS],
        ]);
        // Dropped, so the next L1 action asks again.
        expect(getAgentSigner.mock.calls).toStrictEqual([
          [MAINNET_ACCOUNT],
          [MAINNET_ACCOUNT],
        ]);
        expect(loggerError).not.toHaveBeenCalled();
      });

      it('fails an order edit with KEYRING_LOCKED without logging it', async () => {
        const { accountSignerProvider, infoClient, onAgentRejected } =
          createRejectingProvider('modify');
        infoClient.frontendOpenOrders.mockResolvedValue([
          createFrontendOpenOrder(),
        ]);
        await accountSignerProvider.getMarketDataWithPrices();

        const result = await accountSignerProvider.editOrder({
          orderId: '123',
          newOrder: {
            symbol: 'BTC',
            isBuy: true,
            size: '0.1',
            orderType: 'limit',
            price: '48000',
          },
        });

        expect(result).toStrictEqual({
          success: false,
          error: PERPS_ERROR_CODES.KEYRING_LOCKED,
        });
        expect(onAgentRejected.mock.calls).toStrictEqual([
          [MAINNET_ACCOUNT, AGENT_ADDRESS],
        ]);
        expect(loggerError).not.toHaveBeenCalled();
      });

      it('fails closing positions with KEYRING_LOCKED without logging it', async () => {
        const { accountSignerProvider, onAgentRejected } =
          createRejectingProvider('order');
        await accountSignerProvider.getMarketDataWithPrices();

        const result = await accountSignerProvider.closePositions({
          symbols: ['BTC'],
        });

        expect(result).toStrictEqual({
          success: false,
          successCount: 0,
          failureCount: 1,
          error: PERPS_ERROR_CODES.KEYRING_LOCKED,
          results: [
            {
              symbol: 'BTC',
              success: false,
              error: PERPS_ERROR_CODES.KEYRING_LOCKED,
            },
          ],
        });
        expect(onAgentRejected.mock.calls).toStrictEqual([
          [MAINNET_ACCOUNT, AGENT_ADDRESS],
        ]);
        expect(loggerError).not.toHaveBeenCalled();
      });

      it('fails a TP/SL update with KEYRING_LOCKED without logging it', async () => {
        const { accountSignerProvider, onAgentRejected } =
          createRejectingProvider('order');
        await accountSignerProvider.getMarketDataWithPrices();

        const result = await accountSignerProvider.updatePositionTPSL({
          symbol: 'BTC',
          takeProfitPrice: '60000',
        });

        expect(result).toStrictEqual({
          success: false,
          error: PERPS_ERROR_CODES.KEYRING_LOCKED,
        });
        expect(onAgentRejected.mock.calls).toStrictEqual([
          [MAINNET_ACCOUNT, AGENT_ADDRESS],
        ]);
        expect(loggerError).not.toHaveBeenCalled();
      });

      it('keeps the old protection and fails with KEYRING_LOCKED when its cancel is rejected', async () => {
        const {
          accountSignerProvider,
          exchangeClient,
          infoClient,
          onAgentRejected,
        } = createRejectingProvider('cancel');
        infoClient.frontendOpenOrders.mockResolvedValue([TAKE_PROFIT_ORDER]);
        await accountSignerProvider.getMarketDataWithPrices();

        const result = await accountSignerProvider.updatePositionTPSL({
          symbol: 'BTC',
          takeProfitPrice: '60000',
        });

        expect(result).toStrictEqual({
          success: false,
          error: PERPS_ERROR_CODES.KEYRING_LOCKED,
        });
        expect(exchangeClient.cancel.mock.calls).toStrictEqual([
          [{ cancels: [{ a: 0, o: 456 }] }],
        ]);
        expect(exchangeClient.order).not.toHaveBeenCalled();
        expect(onAgentRejected.mock.calls).toStrictEqual([
          [MAINNET_ACCOUNT, AGENT_ADDRESS],
        ]);
        expect(loggerError).not.toHaveBeenCalled();
      });

      it('keeps the protection and fails with KEYRING_LOCKED when clearing it is rejected', async () => {
        const {
          accountSignerProvider,
          exchangeClient,
          infoClient,
          onAgentRejected,
        } = createRejectingProvider('cancel');
        infoClient.frontendOpenOrders.mockResolvedValue([TAKE_PROFIT_ORDER]);
        await accountSignerProvider.getMarketDataWithPrices();

        const result = await accountSignerProvider.updatePositionTPSL({
          symbol: 'BTC',
        });

        expect(result).toStrictEqual({
          success: false,
          error: PERPS_ERROR_CODES.KEYRING_LOCKED,
        });
        expect(exchangeClient.cancel.mock.calls).toStrictEqual([
          [{ cancels: [{ a: 0, o: 456 }] }],
        ]);
        expect(exchangeClient.order).not.toHaveBeenCalled();
        expect(onAgentRejected.mock.calls).toStrictEqual([
          [MAINNET_ACCOUNT, AGENT_ADDRESS],
        ]);
        expect(loggerError).not.toHaveBeenCalled();
      });

      it('keeps the old protection and fails with KEYRING_LOCKED when its cancel is rejected in a status entry', async () => {
        const {
          accountSignerProvider,
          exchangeClient,
          infoClient,
          initialize,
          onAgentRejected,
        } = createRejectingProvider('cancel');
        infoClient.frontendOpenOrders.mockResolvedValue([TAKE_PROFIT_ORDER]);
        await accountSignerProvider.getMarketDataWithPrices();
        const [[wallet]] = initialize.mock.calls;
        exchangeClient.cancel.mockImplementation(async () => {
          await wallet.signTypedData(L1_PAYLOAD);
          return {
            status: 'ok',
            response: {
              data: {
                statuses: [{ error: rejection(AGENT_ADDRESS).message }],
              },
            },
          };
        });

        const result = await accountSignerProvider.updatePositionTPSL({
          symbol: 'BTC',
          takeProfitPrice: '60000',
        });

        expect(result).toStrictEqual({
          success: false,
          error: PERPS_ERROR_CODES.KEYRING_LOCKED,
        });
        expect(exchangeClient.cancel.mock.calls).toStrictEqual([
          [{ cancels: [{ a: 0, o: 456 }] }],
        ]);
        expect(exchangeClient.order).not.toHaveBeenCalled();
        expect(onAgentRejected.mock.calls).toStrictEqual([
          [MAINNET_ACCOUNT, AGENT_ADDRESS],
        ]);
        expect(loggerError).not.toHaveBeenCalled();
      });

      it('still drops the agent and fails with KEYRING_LOCKED when onAgentRejected throws', async () => {
        const {
          accountSignerProvider,
          getAgentSigner,
          initialize,
          onAgentRejected,
        } = createRejectingProvider('cancel');
        onAgentRejected.mockImplementation(() => {
          throw new Error('host callback failed');
        });
        await accountSignerProvider.getMarketDataWithPrices();

        const result = await accountSignerProvider.cancelOrder({
          orderId: '123',
          symbol: 'BTC',
        });
        await initialize.mock.calls[0][0].signTypedData(L1_PAYLOAD);

        expect(result).toStrictEqual({
          success: false,
          orderId: '123',
          error: PERPS_ERROR_CODES.KEYRING_LOCKED,
        });
        expect(onAgentRejected.mock.calls).toStrictEqual([
          [MAINNET_ACCOUNT, AGENT_ADDRESS],
        ]);
        // Dropped despite the throw, so the next L1 action asks again.
        expect(getAgentSigner.mock.calls).toStrictEqual([
          [MAINNET_ACCOUNT],
          [MAINNET_ACCOUNT],
        ]);
        expect(loggerError).not.toHaveBeenCalled();
      });

      it('fails a margin update with KEYRING_LOCKED without logging it', async () => {
        const { accountSignerProvider, onAgentRejected } =
          createRejectingProvider('updateIsolatedMargin');
        await accountSignerProvider.getMarketDataWithPrices();

        const result = await accountSignerProvider.updateMargin({
          symbol: 'BTC',
          amount: '10',
        });

        expect(result).toStrictEqual({
          success: false,
          error: PERPS_ERROR_CODES.KEYRING_LOCKED,
        });
        expect(onAgentRejected.mock.calls).toStrictEqual([
          [MAINNET_ACCOUNT, AGENT_ADDRESS],
        ]);
        expect(loggerError).not.toHaveBeenCalled();
      });

      it('attributes a rejection to the account the agent signed for after an account switch', async () => {
        const getAgentSigner = jest.fn();
        const onAgentRejected = jest.fn();
        const {
          accountSignerProvider,
          agentSigner,
          exchangeClient,
          initialize,
          selectAccount,
        } = createAccountSignerProvider({
          abstraction: 'unifiedAccount',
          getAgentSigner,
          onAgentRejected,
        });
        getAgentSigner.mockResolvedValue(agentSigner);
        await accountSignerProvider.getMarketDataWithPrices();
        const [[wallet]] = initialize.mock.calls;
        const signed = createDeferred<void>();
        const venue = createDeferred<void>();
        exchangeClient.cancel.mockImplementation(async () => {
          await wallet.signTypedData(L1_PAYLOAD);
          signed.resolve();
          await venue.promise;
          throw rejection(agentSigner.address);
        });

        const cancelling = accountSignerProvider.cancelOrder({
          orderId: '123',
          symbol: 'BTC',
        });
        await signed.promise;
        selectAccount(OTHER_ACCOUNT_ADDRESS);
        venue.resolve();
        const result = await cancelling;
        selectAccount(ACCOUNT_ADDRESS);
        await wallet.signTypedData(L1_PAYLOAD);

        expect(result).toStrictEqual({
          success: false,
          orderId: '123',
          error: PERPS_ERROR_CODES.KEYRING_LOCKED,
        });
        expect(onAgentRejected.mock.calls).toStrictEqual([
          [MAINNET_ACCOUNT, agentSigner.address],
        ]);
        // The signing account's agent was dropped, so it is asked again.
        expect(getAgentSigner.mock.calls).toStrictEqual([
          [MAINNET_ACCOUNT],
          [MAINNET_ACCOUNT],
        ]);
      });

      it('recognizes the rejection of an agent replaced while its action was in flight, and keeps its replacement', async () => {
        const getAgentSigner = jest.fn();
        const onAgentRejected = jest.fn();
        const {
          accountSignerProvider,
          agentSigner,
          exchangeClient,
          initialize,
        } = createAccountSignerProvider({
          abstraction: 'unifiedAccount',
          getAgentSigner,
          onAgentRejected,
        });
        const replacement = {
          address: OTHER_AGENT_ADDRESS,
          signTypedData: jest.fn().mockResolvedValue(OTHER_AGENT_SIGNATURE),
        };
        getAgentSigner.mockResolvedValue(agentSigner);
        await accountSignerProvider.getMarketDataWithPrices();
        const [[wallet]] = initialize.mock.calls;
        const signed = createDeferred<void>();
        const venue = createDeferred<void>();
        exchangeClient.order.mockImplementation(async () => {
          await wallet.signTypedData(L1_PAYLOAD);
          signed.resolve();
          await venue.promise;
          throw rejection(agentSigner.address);
        });

        const ordering = accountSignerProvider.placeOrder({
          symbol: 'BTC',
          isBuy: true,
          size: '0.1',
          orderType: 'market',
          currentPrice: 50000,
        });
        await signed.promise;
        // A binding change (setAgentSigner) drops the resolved agents, and the
        // next L1 action resolves the replacement.
        accountSignerProvider.clearAgentSigners();
        getAgentSigner.mockResolvedValue(replacement);
        await wallet.signTypedData(L1_PAYLOAD);
        venue.resolve();
        const order = await ordering;
        await wallet.signTypedData(L1_PAYLOAD);

        expect(order).toStrictEqual({
          success: false,
          error: PERPS_ERROR_CODES.KEYRING_LOCKED,
        });
        expect(onAgentRejected.mock.calls).toStrictEqual([
          [MAINNET_ACCOUNT, AGENT_ADDRESS],
        ]);
        // The replacement stays resolved: it signs again without a new ask.
        expect(replacement.signTypedData.mock.calls).toStrictEqual([
          [L1_PAYLOAD],
          [L1_PAYLOAD],
        ]);
        expect(getAgentSigner.mock.calls).toStrictEqual([
          [MAINNET_ACCOUNT],
          [MAINNET_ACCOUNT],
        ]);
        expect(loggerError).not.toHaveBeenCalled();
      });

      it('keeps the agent when the venue rejects the main account as unknown', async () => {
        const getAgentSigner = jest.fn();
        const onAgentRejected = jest.fn();
        const {
          accountSignerProvider,
          agentSigner,
          exchangeClient,
          initialize,
        } = createAccountSignerProvider({
          abstraction: 'unifiedAccount',
          getAgentSigner,
          onAgentRejected,
        });
        getAgentSigner.mockResolvedValue(agentSigner);
        await accountSignerProvider.getMarketDataWithPrices();
        const [[wallet]] = initialize.mock.calls;
        exchangeClient.order.mockImplementation(async () => {
          await wallet.signTypedData(L1_PAYLOAD);
          throw rejection(ACCOUNT_ADDRESS);
        });

        const order = await accountSignerProvider.placeOrder({
          symbol: 'BTC',
          isBuy: true,
          size: '0.1',
          orderType: 'market',
          currentPrice: 50000,
        });
        await wallet.signTypedData(L1_PAYLOAD);

        expect(order).toStrictEqual({
          success: false,
          error: PERPS_ERROR_CODES.EXCHANGE_ACCOUNT_NOT_FOUND,
        });
        expect(onAgentRejected).not.toHaveBeenCalled();
        // The referral set up for the first order, the order, then the next
        // L1 action, all with the one resolved agent.
        expect(agentSigner.signTypedData.mock.calls).toStrictEqual([
          [L1_PAYLOAD],
          [L1_PAYLOAD],
          [L1_PAYLOAD],
        ]);
        expect(getAgentSigner.mock.calls).toStrictEqual([[MAINNET_ACCOUNT]]);
      });

      it('fails every in-flight write the venue rejects with KEYRING_LOCKED, after the first drops the agent', async () => {
        const getAgentSigner = jest.fn();
        const onAgentRejected = jest.fn();
        const {
          accountSignerProvider,
          agentSigner,
          exchangeClient,
          initialize,
        } = createAccountSignerProvider({
          abstraction: 'unifiedAccount',
          getAgentSigner,
          onAgentRejected,
        });
        getAgentSigner.mockResolvedValue(agentSigner);
        await accountSignerProvider.getMarketDataWithPrices();
        const [[wallet]] = initialize.mock.calls;
        const bothSigned = createDeferred<void>();
        const venue = createDeferred<void>();
        let signedCancels = 0;
        exchangeClient.cancel.mockImplementation(async () => {
          await wallet.signTypedData(L1_PAYLOAD);
          signedCancels += 1;
          if (signedCancels === 2) {
            bothSigned.resolve();
          }
          await venue.promise;
          throw rejection(agentSigner.address);
        });

        const cancelling = [
          accountSignerProvider.cancelOrder({ orderId: '123', symbol: 'BTC' }),
          accountSignerProvider.cancelOrder({ orderId: '124', symbol: 'BTC' }),
        ];
        await bothSigned.promise;
        venue.resolve();
        const results = await Promise.all(cancelling);
        await wallet.signTypedData(L1_PAYLOAD);

        expect(results).toStrictEqual([
          {
            success: false,
            orderId: '123',
            error: PERPS_ERROR_CODES.KEYRING_LOCKED,
          },
          {
            success: false,
            orderId: '124',
            error: PERPS_ERROR_CODES.KEYRING_LOCKED,
          },
        ]);
        expect(onAgentRejected.mock.calls).toStrictEqual([
          [MAINNET_ACCOUNT, AGENT_ADDRESS],
          [MAINNET_ACCOUNT, AGENT_ADDRESS],
        ]);
        // Dropped, so the next L1 action asks again.
        expect(getAgentSigner.mock.calls).toStrictEqual([
          [MAINNET_ACCOUNT],
          [MAINNET_ACCOUNT],
        ]);
        expect(loggerError).not.toHaveBeenCalled();
      });

      it('recognizes a rejected agent whatever the case of its address', async () => {
        const getAgentSigner = jest.fn();
        const onAgentRejected = jest.fn();
        const { accountSignerProvider, exchangeClient, initialize } =
          createAccountSignerProvider({
            abstraction: 'unifiedAccount',
            getAgentSigner,
            onAgentRejected,
          });
        // The host returns a mixed-case address; the venue names it lowercased.
        const mixedCaseAgent = {
          address: CHECKSUMMED_AGENT_ADDRESS,
          signTypedData: jest.fn().mockResolvedValue(AGENT_SIGNATURE),
        };
        getAgentSigner.mockResolvedValue(mixedCaseAgent);
        await accountSignerProvider.getMarketDataWithPrices();
        const [[wallet]] = initialize.mock.calls;
        exchangeClient.cancel.mockImplementation(async () => {
          await wallet.signTypedData(L1_PAYLOAD);
          throw rejection(CHECKSUMMED_AGENT_ADDRESS.toLowerCase());
        });

        const result = await accountSignerProvider.cancelOrder({
          orderId: '123',
          symbol: 'BTC',
        });
        await wallet.signTypedData(L1_PAYLOAD);

        expect(result).toStrictEqual({
          success: false,
          orderId: '123',
          error: PERPS_ERROR_CODES.KEYRING_LOCKED,
        });
        // The host gets its agent's address as it supplied it.
        expect(onAgentRejected.mock.calls).toStrictEqual([
          [MAINNET_ACCOUNT, CHECKSUMMED_AGENT_ADDRESS],
        ]);
        // Dropped, so the next L1 action asks again.
        expect(getAgentSigner.mock.calls).toStrictEqual([
          [MAINNET_ACCOUNT],
          [MAINNET_ACCOUNT],
        ]);
      });

      it('keeps the agent when the venue reports an unknown wallet without an address', async () => {
        const getAgentSigner = jest.fn();
        const onAgentRejected = jest.fn();
        const {
          accountSignerProvider,
          agentSigner,
          exchangeClient,
          initialize,
        } = createAccountSignerProvider({
          abstraction: 'unifiedAccount',
          getAgentSigner,
          onAgentRejected,
        });
        getAgentSigner.mockResolvedValue(agentSigner);
        await accountSignerProvider.getMarketDataWithPrices();
        const [[wallet]] = initialize.mock.calls;
        exchangeClient.cancel.mockImplementation(async () => {
          await wallet.signTypedData(L1_PAYLOAD);
          throw new Error('User or API Wallet does not exist.');
        });

        const result = await accountSignerProvider.cancelOrder({
          orderId: '123',
          symbol: 'BTC',
        });
        await wallet.signTypedData(L1_PAYLOAD);

        expect(result).toStrictEqual({
          success: false,
          orderId: '123',
          error: PERPS_ERROR_CODES.EXCHANGE_ACCOUNT_NOT_FOUND,
        });
        expect(onAgentRejected).not.toHaveBeenCalled();
        // Kept, so the next L1 action does not ask again.
        expect(getAgentSigner.mock.calls).toStrictEqual([[MAINNET_ACCOUNT]]);
      });

      it('fails a batch cancel with KEYRING_LOCKED without logging it', async () => {
        const { accountSignerProvider, onAgentRejected } =
          createRejectingProvider('cancel');
        await accountSignerProvider.getMarketDataWithPrices();

        const result = await accountSignerProvider.cancelOrders([
          { orderId: '123', symbol: 'BTC' },
          { orderId: '124', symbol: 'BTC' },
        ]);

        expect(result).toStrictEqual({
          success: false,
          successCount: 0,
          failureCount: 2,
          results: [
            {
              orderId: '123',
              symbol: 'BTC',
              success: false,
              error: PERPS_ERROR_CODES.KEYRING_LOCKED,
            },
            {
              orderId: '124',
              symbol: 'BTC',
              success: false,
              error: PERPS_ERROR_CODES.KEYRING_LOCKED,
            },
          ],
        });
        // One batch, so one rejection.
        expect(onAgentRejected.mock.calls).toStrictEqual([
          [MAINNET_ACCOUNT, AGENT_ADDRESS],
        ]);
        expect(loggerError).not.toHaveBeenCalled();
      });

      it('evicts only the agent of the account that signed the rejected action', async () => {
        const getAgentSigner = jest.fn();
        const onAgentRejected = jest.fn();
        const {
          accountSignerProvider,
          agentSigner,
          exchangeClient,
          initialize,
          selectAccount,
        } = createAccountSignerProvider({
          abstraction: 'unifiedAccount',
          getAgentSigner,
          onAgentRejected,
        });
        // The same agent is approved for both accounts.
        getAgentSigner.mockResolvedValue(agentSigner);
        await accountSignerProvider.getMarketDataWithPrices();
        const [[wallet]] = initialize.mock.calls;
        selectAccount(OTHER_ACCOUNT_ADDRESS);
        await wallet.signTypedData(L1_PAYLOAD);
        selectAccount(ACCOUNT_ADDRESS);
        exchangeClient.cancel.mockImplementation(async () => {
          await wallet.signTypedData(L1_PAYLOAD);
          throw rejection(agentSigner.address);
        });

        await accountSignerProvider.cancelOrder({
          orderId: '123',
          symbol: 'BTC',
        });
        selectAccount(OTHER_ACCOUNT_ADDRESS);
        await wallet.signTypedData(L1_PAYLOAD);
        selectAccount(ACCOUNT_ADDRESS);
        await wallet.signTypedData(L1_PAYLOAD);

        expect(onAgentRejected.mock.calls).toStrictEqual([
          [MAINNET_ACCOUNT, AGENT_ADDRESS],
        ]);
        // The other account's agent stays cached, so it is not asked again;
        // the signing account's was dropped, so it is.
        expect(getAgentSigner.mock.calls).toStrictEqual([
          [{ mainAddress: OTHER_ACCOUNT_ADDRESS, isTestnet: false }],
          [MAINNET_ACCOUNT],
          [MAINNET_ACCOUNT],
        ]);
      });

      it('fails the order with KEYRING_LOCKED, drops the agent and asks again', async () => {
        const {
          accountSignerProvider,
          getAgentSigner,
          onAgentRejected,
          initialize,
        } = createRejectingProvider('order');
        await accountSignerProvider.getMarketDataWithPrices();

        const order = await accountSignerProvider.placeOrder({
          symbol: 'BTC',
          isBuy: true,
          size: '0.1',
          orderType: 'market',
          currentPrice: 50000,
        });
        await initialize.mock.calls[0][0].signTypedData(L1_PAYLOAD);

        expect(order).toStrictEqual({
          success: false,
          error: PERPS_ERROR_CODES.KEYRING_LOCKED,
        });
        expect(onAgentRejected.mock.calls).toStrictEqual([
          [MAINNET_ACCOUNT, AGENT_ADDRESS],
        ]);
        expect(getAgentSigner.mock.calls).toStrictEqual([
          [MAINNET_ACCOUNT],
          [MAINNET_ACCOUNT],
        ]);
        expect(loggerError).not.toHaveBeenCalled();
      });

      it('retries the silent migration instead of recording no HyperLiquid account', async () => {
        const { accountSignerProvider, onAgentRejected, exchangeClient } =
          createRejectingProvider('agentSetAbstraction');

        await accountSignerProvider.getMarketDataWithPrices();
        await accountSignerProvider.getMarketDataWithPrices();

        expect(exchangeClient.agentSetAbstraction.mock.calls).toStrictEqual([
          SILENT_MIGRATION_WRITE,
          SILENT_MIGRATION_WRITE,
        ]);
        // Each connect retries the migration, and the venue rejects it again.
        expect(onAgentRejected.mock.calls).toStrictEqual([
          [MAINNET_ACCOUNT, AGENT_ADDRESS],
          [MAINNET_ACCOUNT, AGENT_ADDRESS],
        ]);
        expect(trackPerpsEvent.mock.calls).toStrictEqual([
          [
            PerpsAnalyticsEvent.AccountSetup,
            {
              [PERPS_EVENT_PROPERTY.ABSTRACTION_MODE]: 'default',
              [PERPS_EVENT_PROPERTY.STATUS]:
                PERPS_EVENT_VALUE.STATUS.MIGRATION_REQUIRED,
            },
          ],
          [
            PerpsAnalyticsEvent.AccountSetup,
            {
              [PERPS_EVENT_PROPERTY.ABSTRACTION_MODE]: 'default',
              [PERPS_EVENT_PROPERTY.STATUS]:
                PERPS_EVENT_VALUE.STATUS.MIGRATION_REQUIRED,
            },
          ],
        ]);
        expect(migrationAttempted()).toBe(false);
        expect(loggerError).not.toHaveBeenCalled();
      });

      it('leaves the referral to retry, unrecorded', async () => {
        const { accountSignerProvider, onAgentRejected, exchangeClient } =
          createRejectingProvider('setReferrer');

        const result = await accountSignerProvider.prepareTradingWallet();

        expect(result).toStrictEqual({ ready: false });
        expect(exchangeClient.setReferrer.mock.calls).toStrictEqual([
          REFERRAL_WRITE,
        ]);
        expect(onAgentRejected.mock.calls).toStrictEqual([
          [MAINNET_ACCOUNT, AGENT_ADDRESS],
        ]);
        expect(referralAttempted()).toBe(false);
        expect(loggerError).not.toHaveBeenCalled();
      });

      it('keeps treating a rejected main account as a wallet with no HyperLiquid account', async () => {
        const getAgentSigner = jest.fn().mockResolvedValue(null);
        const onAgentRejected = jest.fn();
        const { accountSignerProvider, exchangeClient, initialize } =
          createAccountSignerProvider({
            abstraction: 'unifiedAccount',
            getAgentSigner,
            onAgentRejected,
          });
        exchangeClient.order.mockImplementation(async () => {
          await initialize.mock.calls[0][0].signTypedData(L1_PAYLOAD);
          throw rejection(ACCOUNT_ADDRESS);
        });
        await accountSignerProvider.getMarketDataWithPrices();

        const order = await accountSignerProvider.placeOrder({
          symbol: 'BTC',
          isBuy: true,
          size: '0.1',
          orderType: 'market',
          currentPrice: 50000,
        });

        expect(order).toStrictEqual({
          success: false,
          error: PERPS_ERROR_CODES.EXCHANGE_ACCOUNT_NOT_FOUND,
        });
        expect(onAgentRejected).not.toHaveBeenCalled();
      });
    });

    describe('when a strategy cancel cannot be signed', () => {
      const ETH_ORDER = {
        symbol: 'ETH',
        isBuy: true,
        size: '1',
        currentPrice: 3000,
      } as const;
      const SCALE_ORDER = {
        ...ETH_ORDER,
        orderType: 'scale',
        scaleMinPrice: '2000',
        scaleMaxPrice: '3000',
        scaleNumOrders: 2,
      } as const;
      const TWAP_HISTORY = [
        {
          time: 1_700_000_030,
          twapId: 987,
          state: {
            coin: 'ETH',
            executedNtl: '0',
            executedSz: '0',
            minutes: 30,
            randomize: false,
            reduceOnly: false,
            side: 'B',
            sz: '1',
            timestamp: NOW,
            user: ACCOUNT_ADDRESS,
          },
          status: { status: 'activated' },
        },
      ];

      /**
       * An ETH book whose best bid is the given price.
       *
       * @param bid - The best bid.
       * @returns The book.
       */
      const bookAt = (bid: string): Record<string, unknown> => ({
        coin: 'ETH',
        levels: [
          [{ px: bid, sz: '10', n: 1 }],
          [{ px: '3001', sz: '10', n: 1 }],
        ],
      });

      /**
       * An exchange response carrying one status per request.
       *
       * @param statuses - The statuses.
       * @returns The response.
       */
      const withStatuses = (
        ...statuses: unknown[]
      ): Record<string, unknown> => ({
        status: 'ok',
        response: { data: { statuses } },
      });

      type SignerFailure = 'locked' | 'unavailable' | 'rejected' | 'reported';

      /**
       * A provider whose strategy orders are placed while signing works, and
       * whose later cancels sign through the SDK wallet: `failSigning` locks
       * the keyring (no agent), makes the agent fail to sign, or has the venue
       * reject the agent, by throwing or in the cancel status entries.
       *
       * @param failure - How the cancel fails to be signed.
       * @returns The provider, its endpoints and the failure switch.
       */
      function createStrategyProvider(failure: SignerFailure): {
        provider: HyperLiquidProvider;
        order: jest.Mock;
        cancel: jest.Mock;
        cancelByCloid: jest.Mock;
        twapCancel: jest.Mock;
        twapOrder: jest.Mock;
        l2Book: jest.Mock;
        getAgentSigner: jest.Mock;
        onAgentRejected: jest.Mock;
        signL1Action: () => Promise<Hex>;
        failSigning: () => void;
      } {
        let signerReady = true;
        const cancel = jest.fn();
        const cancelByCloid = jest.fn();
        const twapCancel = jest.fn();
        const twapOrder = jest.fn();
        const l2Book = jest.fn().mockResolvedValue(bookAt('2999'));
        const getAgentSigner = jest.fn();
        const onAgentRejected = jest.fn();
        const fixture = createAccountSignerProvider({
          abstraction: 'unifiedAccount',
          signer: { isReady: () => signerReady },
          getAgentSigner,
          onAgentRejected,
          exchange: { cancel, cancelByCloid, twapCancel, twapOrder },
          info: {
            twapHistory: jest.fn().mockResolvedValue(TWAP_HISTORY),
            userTwapSliceFills: jest.fn().mockResolvedValue([]),
            l2Book,
            // The resting chase order, read before a re-price.
            orderStatus: jest.fn().mockResolvedValue({
              status: 'order',
              order: {
                status: 'open',
                order: createFrontendOpenOrder({
                  coin: 'ETH',
                  limitPx: '2999.1',
                  sz: '1',
                  origSz: '1',
                  tif: 'Alo',
                }),
              },
            }),
          },
        });
        getAgentSigner.mockResolvedValue(
          failure === 'locked' ? null : fixture.agentSigner,
        );
        const signL1Action = async (): Promise<Hex> =>
          await fixture.initialize.mock.calls[0][0].signTypedData(L1_PAYLOAD);
        const signedCancel = async (): Promise<never> => {
          await signL1Action();
          // Only a rejected agent gets this far.
          throw rejection(fixture.agentSigner.address);
        };
        // The venue answers with a rejection in every status entry.
        const rejectedEntry = {
          error: rejection(fixture.agentSigner.address).message,
        };
        const reportedCancel = async ({
          cancels,
        }: {
          cancels: unknown[];
        }): Promise<Record<string, unknown>> => {
          await signL1Action();
          return withStatuses(...cancels.map(() => rejectedEntry));
        };
        const reportedTwapCancel = async (): Promise<
          Record<string, unknown>
        > => {
          await signL1Action();
          return {
            status: 'ok',
            response: { type: 'twapCancel', data: { status: rejectedEntry } },
          };
        };
        return {
          provider: fixture.accountSignerProvider,
          order: fixture.exchangeClient.order,
          cancel,
          cancelByCloid,
          twapCancel,
          twapOrder,
          l2Book,
          getAgentSigner,
          onAgentRejected,
          signL1Action,
          failSigning: (): void => {
            signerReady = failure !== 'locked';
            if (failure === 'unavailable') {
              fixture.agentSigner.signTypedData.mockRejectedValue(
                new Error('agent key locked'),
              );
            }
            if (failure === 'reported') {
              cancel.mockImplementation(reportedCancel);
              cancelByCloid.mockImplementation(reportedCancel);
              twapCancel.mockImplementation(reportedTwapCancel);
              return;
            }
            for (const endpoint of [cancel, cancelByCloid, twapCancel]) {
              endpoint.mockImplementation(signedCancel);
            }
          },
        };
      }

      const SIGNER_FAILURES = [
        { name: 'a locked keyring', failure: 'locked', rejectedAgents: [] },
        {
          name: 'an agent that cannot sign',
          failure: 'unavailable',
          rejectedAgents: [],
        },
        {
          name: 'an agent the venue rejects',
          failure: 'rejected',
          rejectedAgents: [[MAINNET_ACCOUNT, AGENT_ADDRESS]],
        },
        {
          name: 'an agent the venue rejects in status entries',
          failure: 'reported',
          rejectedAgents: [[MAINNET_ACCOUNT, AGENT_ADDRESS]],
        },
      ] as const;

      it.each(SIGNER_FAILURES)(
        'fails a TWAP cancel with KEYRING_LOCKED without logging it, for $name',
        async ({ failure, rejectedAgents }) => {
          const { provider, twapCancel, onAgentRejected, failSigning } =
            createStrategyProvider(failure);
          await provider.getMarketDataWithPrices();
          failSigning();

          const result = await provider.cancelOrder({
            orderId: '987',
            symbol: 'ETH',
            orderType: 'twap',
          });

          expect(result).toStrictEqual({
            success: false,
            orderId: '987',
            error: PERPS_ERROR_CODES.KEYRING_LOCKED,
          });
          expect(twapCancel.mock.calls).toStrictEqual([[{ a: 1, t: 987 }]]);
          expect(onAgentRejected.mock.calls).toStrictEqual(rejectedAgents);
          expect(loggerError).not.toHaveBeenCalled();
        },
      );

      it.each(SIGNER_FAILURES)(
        'fails a scale cancel with KEYRING_LOCKED and keeps the ladder cancellable, for $name',
        async ({ failure, rejectedAgents }) => {
          const { provider, order, cancel, onAgentRejected, failSigning } =
            createStrategyProvider(failure);
          order.mockResolvedValueOnce(
            withStatuses({ resting: { oid: 11 } }, { resting: { oid: 22 } }),
          );
          const placed = await provider.placeOrder(SCALE_ORDER);
          failSigning();

          const result = await provider.cancelOrder({
            orderId: placed.orderId as string,
            symbol: 'ETH',
            orderType: 'scale',
          });
          cancel.mockResolvedValue(withStatuses('success', 'success'));
          const retry = await provider.cancelOrder({
            orderId: placed.orderId as string,
            symbol: 'ETH',
            orderType: 'scale',
          });

          expect(result).toStrictEqual({
            success: false,
            orderId: placed.orderId,
            error: PERPS_ERROR_CODES.KEYRING_LOCKED,
          });
          expect(retry).toStrictEqual({
            success: true,
            orderId: placed.orderId,
          });
          expect(cancel.mock.calls).toStrictEqual([
            [
              {
                cancels: [
                  { a: 1, o: 11 },
                  { a: 1, o: 22 },
                ],
              },
            ],
            [
              {
                cancels: [
                  { a: 1, o: 11 },
                  { a: 1, o: 22 },
                ],
              },
            ],
          ]);
          expect(onAgentRejected.mock.calls).toStrictEqual(rejectedAgents);
          expect(loggerError).not.toHaveBeenCalled();
        },
      );

      it.each(SIGNER_FAILURES)(
        'fails a scale cancel by client order ID with KEYRING_LOCKED, for $name',
        async ({ failure, rejectedAgents }) => {
          const {
            provider,
            order,
            cancelByCloid,
            onAgentRejected,
            failSigning,
          } = createStrategyProvider(failure);
          // Neither rung rests, and the cleanup cannot cancel them, so the
          // ladder stays registered by client order ID.
          order.mockResolvedValueOnce(
            withStatuses('waitingForFill', 'waitingForFill'),
          );
          cancelByCloid.mockResolvedValueOnce(
            withStatuses({ error: 'Busy' }, { error: 'Busy' }),
          );
          const placed = await provider.placeOrder(SCALE_ORDER);
          const [[{ orders }]] = order.mock.calls as [
            [{ orders: { c: Hex }[] }],
          ];
          loggerError.mockClear();
          failSigning();

          const result = await provider.cancelOrder({
            orderId: placed.orderId as string,
            symbol: 'ETH',
            orderType: 'scale',
          });

          expect(placed.orderId).toMatch(/^scale:/u);
          expect(placed).toStrictEqual({
            success: false,
            error: PERPS_ERROR_CODES.ORDER_STRATEGY_CANCEL_INCOMPLETE,
            orderId: placed.orderId,
            acceptedChildren: [
              { state: 'waitingForFill' },
              { state: 'waitingForFill' },
            ],
            acceptedSize: '1',
            submittedSize: '1',
            weightedAverageLimitPrice: '2500',
            childOrderIds: [],
          });
          expect(result).toStrictEqual({
            success: false,
            orderId: placed.orderId,
            error: PERPS_ERROR_CODES.KEYRING_LOCKED,
          });
          const cloidCancels = {
            cancels: orders.map(({ c }) => ({ asset: 1, cloid: c })),
          };
          // The placement's cleanup, then the cancel.
          expect(cancelByCloid.mock.calls).toStrictEqual([
            [cloidCancels],
            [cloidCancels],
          ]);
          expect(onAgentRejected.mock.calls).toStrictEqual(rejectedAgents);
          expect(loggerError).not.toHaveBeenCalled();
        },
      );

      it.each(SIGNER_FAILURES)(
        'fails a chase cancel with KEYRING_LOCKED without logging it, for $name',
        async ({ failure, rejectedAgents }) => {
          const { provider, cancel, onAgentRejected, failSigning } =
            createStrategyProvider(failure);
          const placed = await provider.placeOrder({
            ...ETH_ORDER,
            orderType: 'chase',
          });
          failSigning();

          const result = await provider.cancelOrder({
            orderId: placed.orderId as string,
            symbol: 'ETH',
            orderType: 'chase',
          });

          expect(result).toStrictEqual({
            success: false,
            orderId: placed.orderId,
            error: PERPS_ERROR_CODES.KEYRING_LOCKED,
          });
          expect(cancel.mock.calls).toStrictEqual([
            [{ cancels: [{ a: 1, o: 123 }] }],
          ]);
          expect(onAgentRejected.mock.calls).toStrictEqual(rejectedAgents);
          expect(loggerError).not.toHaveBeenCalled();
        },
      );

      it.each([
        [
          'thrown',
          (): Promise<never> => Promise.reject(rejection(AGENT_ADDRESS)),
        ],
        [
          'in its status entry',
          async (): Promise<Record<string, unknown>> => ({
            status: 'ok',
            response: {
              type: 'twapCancel',
              data: { status: { error: rejection(AGENT_ADDRESS).message } },
            },
          }),
        ],
      ])(
        'drops an agent the venue rejects while retracting a stale TWAP (%s)',
        async (_how, answerCancel) => {
          const {
            provider,
            twapOrder,
            twapCancel,
            getAgentSigner,
            onAgentRejected,
            signL1Action,
          } = createStrategyProvider('rejected');
          let disconnected: Promise<unknown> | undefined;
          // The provider is torn down while the TWAP is placed, so it
          // retracts it.
          twapOrder.mockImplementation(async () => {
            await signL1Action();
            disconnected = provider.disconnect();
            return {
              status: 'ok',
              response: {
                type: 'twapOrder',
                data: { status: { running: { twapId: 987 } } },
              },
            };
          });
          twapCancel.mockImplementation(async () => {
            await signL1Action();
            return await answerCancel();
          });

          const placed = await provider.placeOrder({
            ...ETH_ORDER,
            orderType: 'twap',
            twapDuration: 30,
          });
          await disconnected;
          await signL1Action();

          // The retraction was refused, so the TWAP is reported as live.
          expect(placed).toStrictEqual({
            success: false,
            error: PERPS_ERROR_CODES.PROVIDER_LIFECYCLE_STALE,
            submittedSize: '1',
            orderId: '987',
          });
          expect(twapCancel.mock.calls).toStrictEqual([[{ a: 1, t: 987 }]]);
          expect(onAgentRejected.mock.calls).toStrictEqual([
            [MAINNET_ACCOUNT, AGENT_ADDRESS],
          ]);
          // Dropped, so the next L1 action asks again.
          expect(getAgentSigner.mock.calls).toStrictEqual([
            [MAINNET_ACCOUNT],
            [MAINNET_ACCOUNT],
          ]);
          expect(loggerError).not.toHaveBeenCalled();
        },
      );

      it.each([
        [
          'thrown',
          (): Promise<never> => Promise.reject(rejection(AGENT_ADDRESS)),
        ],
        [
          'in its status entry',
          async (): Promise<Record<string, unknown>> =>
            withStatuses({ error: rejection(AGENT_ADDRESS).message }),
        ],
      ])(
        'drops an agent the venue rejects while retracting an abandoned chase order (%s)',
        async (_how, answerCancel) => {
          const {
            provider,
            order,
            cancel,
            getAgentSigner,
            onAgentRejected,
            signL1Action,
          } = createStrategyProvider('rejected');
          let disconnected: Promise<unknown> | undefined;
          // The provider is torn down while the chase order is placed, so it
          // retracts it.
          order.mockImplementation(async () => {
            await signL1Action();
            disconnected = provider.disconnect();
            return withStatuses({ resting: { oid: 123 } });
          });
          cancel.mockImplementation(async () => {
            await signL1Action();
            return await answerCancel();
          });

          const placed = await provider.placeOrder({
            ...ETH_ORDER,
            orderType: 'chase',
          });
          await disconnected;
          await signL1Action();

          // The retraction was refused, so the order is reported as resting.
          expect(placed).toStrictEqual({
            success: false,
            error: PERPS_ERROR_CODES.ORDER_CHASE_ABANDONED,
            submittedSize: '1',
            childOrderIds: ['123'],
          });
          expect(cancel.mock.calls).toStrictEqual([
            [{ cancels: [{ a: 1, o: 123 }] }],
          ]);
          expect(onAgentRejected.mock.calls).toStrictEqual([
            [MAINNET_ACCOUNT, AGENT_ADDRESS],
          ]);
          // Dropped, so the next L1 action asks again.
          expect(getAgentSigner.mock.calls).toStrictEqual([
            [MAINNET_ACCOUNT],
            [MAINNET_ACCOUNT],
          ]);
          expect(loggerError).not.toHaveBeenCalled();
        },
      );

      describe('during a chase re-price', () => {
        beforeEach(() => {
          jest.useFakeTimers();
        });

        afterEach(() => {
          jest.useRealTimers();
        });

        it('drops an agent the venue rejects, so the next L1 action asks again', async () => {
          const {
            provider,
            cancel,
            l2Book,
            getAgentSigner,
            onAgentRejected,
            signL1Action,
            failSigning,
          } = createStrategyProvider('rejected');
          await provider.placeOrder({
            ...ETH_ORDER,
            orderType: 'chase',
            chaseIntervalMs: 1000,
          });
          // The touch moves, so the next tick cancels to re-price.
          l2Book.mockResolvedValue(bookAt('2998'));
          failSigning();

          await jest.advanceTimersByTimeAsync(1000);
          await signL1Action();

          expect(cancel.mock.calls).toStrictEqual([
            [{ cancels: [{ a: 1, o: 123 }] }],
          ]);
          expect(onAgentRejected.mock.calls).toStrictEqual([
            [MAINNET_ACCOUNT, AGENT_ADDRESS],
          ]);
          // Resolved for the placement, then asked again after the rejection.
          expect(getAgentSigner.mock.calls).toStrictEqual([
            [MAINNET_ACCOUNT],
            [MAINNET_ACCOUNT],
          ]);
          expect(loggerError).not.toHaveBeenCalled();
        });
      });
    });

    it('fails an order with KEYRING_LOCKED without reporting it when getAgentSigner rejects', async () => {
      const getAgentSigner = jest.fn().mockResolvedValue(null);
      const { accountSignerProvider } = createAccountSignerProvider({
        abstraction: 'unifiedAccount',
        getAgentSigner,
      });
      await accountSignerProvider.getMarketDataWithPrices();
      getAgentSigner.mockRejectedValue(new Error('agent store unavailable'));

      const order = await accountSignerProvider.placeOrder({
        symbol: 'BTC',
        isBuy: true,
        size: '0.1',
        orderType: 'market',
        currentPrice: 50000,
      });

      expect(order).toStrictEqual({
        success: false,
        error: PERPS_ERROR_CODES.KEYRING_LOCKED,
      });
      expect(loggerError).not.toHaveBeenCalled();
    });

    it('reports a failed answer asked again after a clear as unavailable', async () => {
      const { getAgentSigner, answer, asked } = createPendingResolver();
      const { accountSignerProvider, agentSigner, initialize } =
        createAccountSignerProvider({
          abstraction: 'unifiedAccount',
          getAgentSigner,
        });
      await accountSignerProvider.getMarketDataWithPrices();
      const [[wallet]] = initialize.mock.calls;

      const signing = wallet.signTypedData(L1_PAYLOAD);
      await asked;
      getAgentSigner.mockRejectedValue(new Error('agent store unavailable'));
      accountSignerProvider.clearAgentSigners();
      answer.resolve(agentSigner);

      await expect(signing).rejects.toBeInstanceOf(AgentSignerUnavailableError);
      // Asked again after the clear, and that answer failed.
      expect(getAgentSigner.mock.calls).toStrictEqual([
        [MAINNET_ACCOUNT],
        [MAINNET_ACCOUNT],
      ]);
      expect(agentSigner.signTypedData).not.toHaveBeenCalled();
    });
  });
});
