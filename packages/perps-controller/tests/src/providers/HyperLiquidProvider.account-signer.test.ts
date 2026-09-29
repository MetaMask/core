import type { Hex } from '@metamask/utils';

import { PERPS_ERROR_CODES } from '../../../src/perpsErrorCodes.js';
import { HyperLiquidProvider } from '../../../src/providers/HyperLiquidProvider.js';
import { AgentBindings } from '../../../src/services/agentSigner.js';
import { HyperLiquidClientService } from '../../../src/services/HyperLiquidClientService.js';
import type { HyperLiquidWalletParams } from '../../../src/services/HyperLiquidClientService.js';
import { HyperLiquidSubscriptionService } from '../../../src/services/HyperLiquidSubscriptionService.js';
import {
  PerpsSigningCache,
  TradingReadinessCache,
} from '../../../src/services/TradingReadinessCache.js';
import type {
  HyperLiquidCredentials,
  PerpsAgentAccount,
  PerpsAgentSigner,
  PerpsPlatformDependencies,
  PerpsTypedDataPayload,
} from '../../../src/types/index.js';
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

// Only the I/O boundaries are mocked: the REST/exchange/info clients and the
// WebSocket subscriptions. The wallet service, the signing caches and the
// validation run for real.
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
  let debugLog: jest.SpyInstance;
  let trackPerpsEvent: jest.SpyInstance;

  beforeEach(() => {
    TradingReadinessCache.clearAll();
    mockPlatformDependencies = createMockInfrastructure();
    loggerError = jest.spyOn(mockPlatformDependencies.logger, 'error');
    debugLog = jest.spyOn(mockPlatformDependencies.debugLogger, 'log');
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

  // The wallet service and the signing caches are real, and the messenger
  // has no KeyringController, so every main-account signature must reach
  // the injected accountSigner. The SDK exchange client is the mocked
  // boundary: like the SDK, it signs through the wallet the provider
  // initialized it with.
  const ACCOUNT_ADDRESS = createMockEvmAccount().address;
  const OTHER_ACCOUNT_ADDRESS =
    '0x00000000000000000000000000000000000b0b01' as const;
  const AGENT_ADDRESS = '0x00000000000000000000000000000000000a9e17' as const;
  const SIGNATURE = `0x${'cd'.repeat(65)}` as const;
  const AGENT_SIGNATURE = `0x${'ef'.repeat(65)}` as const;
  const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000' as const;
  // Shapes the SDK signs: user-signed actions use the
  // HyperliquidSignTransaction domain, L1 actions the Exchange domain.
  const USER_SIGNED_PAYLOAD: PerpsTypedDataPayload = {
    domain: {
      name: 'HyperliquidSignTransaction',
      version: '1',
      chainId: 1,
      verifyingContract: ZERO_ADDRESS,
    },
    types: {
      'HyperliquidTransaction:UserSetAbstraction': [
        { name: 'hyperliquidChain', type: 'string' },
        { name: 'user', type: 'address' },
        { name: 'abstraction', type: 'string' },
        { name: 'nonce', type: 'uint64' },
      ],
    },
    primaryType: 'HyperliquidTransaction:UserSetAbstraction',
    message: {
      hyperliquidChain: 'Mainnet',
      user: ACCOUNT_ADDRESS,
      abstraction: 'unifiedAccount',
      nonce: 1,
    },
  };
  const L1_PAYLOAD: PerpsTypedDataPayload = {
    domain: {
      name: 'Exchange',
      version: '1',
      chainId: 1337,
      verifyingContract: ZERO_ADDRESS,
    },
    types: {
      Agent: [
        { name: 'source', type: 'string' },
        { name: 'connectionId', type: 'bytes32' },
      ],
    },
    primaryType: 'Agent',
    message: { source: 'a', connectionId: `0x${'22'.repeat(32)}` },
  };

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
      signTypedData: jest.fn().mockResolvedValue(SIGNATURE),
      signPersonalMessage: jest.fn(),
      ...options.signer,
    };
    const agentSigner = {
      address: AGENT_ADDRESS,
      signTypedData: jest.fn().mockResolvedValue(AGENT_SIGNATURE),
    };
    const { messenger, call, selectAccount } = options.keyring
      ? createKeyringMessenger(SIGNATURE)
      : createKeyringlessMessenger();
    let sdkWallet: HyperLiquidWalletParams | undefined;
    const initialize = jest.fn(async (wallet: HyperLiquidWalletParams) => {
      sdkWallet = wallet;
    });
    Object.assign(mockClientService, { initialize });
    const signThroughSdkWallet =
      (
        payload: PerpsTypedDataPayload,
        response: Record<string, unknown> = { status: 'ok' },
      ): (() => Promise<Record<string, unknown>>) =>
      async () => {
        if (!sdkWallet) {
          throw new Error('SDK used before initialize');
        }
        await sdkWallet.signTypedData(payload);
        return response;
      };
    const exchangeClient = createMockExchangeClient({
      userSetAbstraction: jest.fn(signThroughSdkWallet(USER_SIGNED_PAYLOAD)),
      agentSetAbstraction: jest.fn(signThroughSdkWallet(L1_PAYLOAD)),
      setReferrer: jest.fn(signThroughSdkWallet(L1_PAYLOAD)),
      approveBuilderFee: jest.fn(signThroughSdkWallet(USER_SIGNED_PAYLOAD)),
      order: jest.fn(
        signThroughSdkWallet(L1_PAYLOAD, {
          status: 'ok',
          response: { data: { statuses: [{ resting: { oid: 123 } }] } },
        }),
      ),
    });
    const infoClient = createMockInfoClient({
      userAbstraction: jest
        .fn()
        .mockResolvedValue(options.abstraction ?? 'dexAbstraction'),
    });
    mockClientService.getExchangeClient.mockReturnValue(
      exchangeClient as unknown as ReturnType<
        HyperLiquidClientService['getExchangeClient']
      >,
    );
    mockClientService.getInfoClient.mockReturnValue(
      infoClient as unknown as ReturnType<
        HyperLiquidClientService['getInfoClient']
      >,
    );
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

    expect(exchangeClient.userSetAbstraction).toHaveBeenCalledWith({
      user: ACCOUNT_ADDRESS,
      abstraction: 'unifiedAccount',
    });
    expect(accountSigner.signTypedData).toHaveBeenCalledWith(
      ACCOUNT_ADDRESS,
      USER_SIGNED_PAYLOAD,
    );
    expect(keyringCalls(call)).toStrictEqual([]);
  });

  it('defers the init-time migration when accountSigner reports a hardware wallet', async () => {
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

    expect(exchangeClient.userSetAbstraction).toHaveBeenCalledTimes(1);
    expect(accountSigner.signTypedData).not.toHaveBeenCalled();
    expect(migrationAttempted()).toBe(false);
    expect(keyringCalls(call)).toStrictEqual([]);
  });

  describe('prepareTradingWallet', () => {
    it('runs the deferred migration, builder fee and referral setup and reports ready', async () => {
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
      expect(exchangeClient.userSetAbstraction).toHaveBeenCalledTimes(1);
      expect(exchangeClient.setReferrer).toHaveBeenCalledTimes(1);
      expect(accountSigner.signTypedData.mock.calls).toStrictEqual([
        [ACCOUNT_ADDRESS, USER_SIGNED_PAYLOAD],
        [ACCOUNT_ADDRESS, L1_PAYLOAD],
      ]);
      expect(infoClient.maxBuilderFee).toHaveBeenCalled();
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
        [ACCOUNT_ADDRESS, USER_SIGNED_PAYLOAD],
      ]);
      expect(order.success).toBe(true);
      expect(accountSigner.signTypedData.mock.calls).toStrictEqual([
        [ACCOUNT_ADDRESS, L1_PAYLOAD],
      ]);
      expect(exchangeClient.userSetAbstraction).toHaveBeenCalledTimes(1);
      expect(exchangeClient.approveBuilderFee).toHaveBeenCalledTimes(1);
      expect(exchangeClient.setReferrer).toHaveBeenCalledTimes(1);
    });

    it('makes its own referral attempt when another provider ended without a result', async () => {
      const { accountSignerProvider, exchangeClient } =
        createAccountSignerProvider({ abstraction: 'unifiedAccount' });
      // Another provider holds the referral lock and ends without caching a
      // result; release it once this provider is waiting on it.
      const release = PerpsSigningCache.setInFlight(
        'referral',
        'mainnet',
        ACCOUNT_ADDRESS,
      );
      const waiting = '[ensureReferralSet] Global in-flight, waiting...';
      (debugLog as jest.Mock).mockImplementation((message: string) => {
        if (message === waiting) {
          release();
        }
      });

      const result = await accountSignerProvider.prepareTradingWallet();

      expect(debugLog).toHaveBeenCalledWith(waiting, { network: 'mainnet' });
      expect(exchangeClient.setReferrer).toHaveBeenCalledTimes(1);
      expect(
        PerpsSigningCache.getReferral('mainnet', ACCOUNT_ADDRESS),
      ).toStrictEqual({
        attempted: true,
        success: true,
      });
      expect(result).toStrictEqual({ ready: true });
    });

    it('signs nothing more when called again', async () => {
      const { accountSignerProvider, accountSigner } =
        createAccountSignerProvider({
          signer: { requiresSignatureConfirmation: () => true },
        });
      await accountSignerProvider.prepareTradingWallet();
      const signaturesAfterFirstCall =
        accountSigner.signTypedData.mock.calls.length;

      const result = await accountSignerProvider.prepareTradingWallet();

      expect(result).toStrictEqual({ ready: true });
      expect(
        TradingReadinessCache.get('mainnet', ACCOUNT_ADDRESS),
      ).toStrictEqual(
        expect.objectContaining({ attempted: true, enabled: true }),
      );
      expect(signaturesAfterFirstCall).toBeGreaterThan(0);
      expect(accountSigner.signTypedData).toHaveBeenCalledTimes(
        signaturesAfterFirstCall,
      );
    });

    it('reports ready after the user declines the migration, since it is not asked again', async () => {
      const { accountSignerProvider, accountSigner } =
        createAccountSignerProvider({
          signer: { requiresSignatureConfirmation: () => true },
        });
      accountSigner.signTypedData.mockImplementation(
        async (_address: string, payload: PerpsTypedDataPayload) => {
          if (payload === USER_SIGNED_PAYLOAD) {
            throw new Error('User rejected the request.');
          }
          return SIGNATURE;
        },
      );

      const result = await accountSignerProvider.prepareTradingWallet();

      expect(result).toStrictEqual({ ready: true });
      expect(
        TradingReadinessCache.get('mainnet', ACCOUNT_ADDRESS),
      ).toStrictEqual(
        expect.objectContaining({ attempted: true, enabled: false }),
      );
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
    });

    it('reports KEYRING_LOCKED when accountSigner is not ready', async () => {
      const { accountSignerProvider } = createAccountSignerProvider({
        signer: { isReady: () => false },
      });

      const result = await accountSignerProvider.prepareTradingWallet();

      expect(result).toStrictEqual({
        ready: false,
        error: PERPS_ERROR_CODES.KEYRING_LOCKED,
      });
    });

    it('reports and logs the error when the clients cannot initialize', async () => {
      const { accountSignerProvider, initialize } =
        createAccountSignerProvider();
      initialize.mockRejectedValue(new Error('transport unavailable'));

      const result = await accountSignerProvider.prepareTradingWallet();

      expect(result).toStrictEqual({
        ready: false,
        error: 'transport unavailable',
      });
      expect(loggerError).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'transport unavailable' }),
        {
          tags: {
            feature: 'perps',
            provider: 'hyperliquid',
            network: 'mainnet',
          },
          context: {
            name: 'HyperLiquidProvider',
            data: { method: 'prepareTradingWallet' },
          },
        },
      );
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

    it('signs the deferred setup through the keyring without accountSigner', async () => {
      const { accountSignerProvider, accountSigner, call, exchangeClient } =
        createAccountSignerProvider({ keyring: true });
      await accountSignerProvider.getMarketDataWithPrices();

      const result = await accountSignerProvider.prepareTradingWallet();

      expect(result).toStrictEqual({ ready: true });
      expect(exchangeClient.userSetAbstraction).toHaveBeenCalledTimes(1);
      expect(exchangeClient.setReferrer).toHaveBeenCalledTimes(1);
      expect(accountSigner.signTypedData).not.toHaveBeenCalled();
      expect(
        keyringCalls(call).filter(
          (action) => action === 'KeyringController:signTypedMessage',
        ),
      ).toHaveLength(2);
    });

    it('reports KEYRING_LOCKED when the signer locks after setup completed', async () => {
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
      expect(getAgentSigner).toHaveBeenCalledTimes(1);
      expect(agentSigner.signTypedData).toHaveBeenCalledTimes(2);
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

      expect(getAgentSigner).toHaveBeenCalledTimes(2);
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
      const { accountSignerProvider, accountSigner, exchangeClient } =
        createAccountSignerProvider({
          abstraction: 'default',
          getAgentSigner,
        });

      const marketData = await accountSignerProvider.getMarketDataWithPrices();
      const result = await accountSignerProvider.prepareTradingWallet();

      expect(marketData).toHaveLength(2);
      // A failed silent migration is retried: at connect, when prepare
      // re-runs the connect steps, and once more by the trading setup; the
      // referral write is the fourth L1 action. Each asks getAgentSigner.
      expect(exchangeClient.agentSetAbstraction).toHaveBeenCalledTimes(3);
      expect(exchangeClient.setReferrer).toHaveBeenCalledTimes(1);
      expect(getAgentSigner).toHaveBeenCalledTimes(4);
      expect(accountSigner.signTypedData).not.toHaveBeenCalled();
      expect(result).toStrictEqual({ ready: false });
      // Retryable like a locked keyring: no failure metric, nothing logged.
      expect(trackPerpsEvent).not.toHaveBeenCalledWith(
        'Perp Account Setup',
        expect.objectContaining({ status: 'failed' }),
      );
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

      expect(accountSigner.signTypedData.mock.calls[0]).toStrictEqual([
        ACCOUNT_ADDRESS,
        L1_PAYLOAD,
      ]);
      expect(agentSigner.signTypedData).toHaveBeenCalledWith(L1_PAYLOAD);
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
      expect(accountSigner.signTypedData).toHaveBeenCalledTimes(2);
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

      expect(getAgentSigner).toHaveBeenCalledTimes(1);
      expect(agentSigner.signTypedData).toHaveBeenCalledTimes(2);
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

    it('stops agent signing on lock and resumes after unlock', async () => {
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

      expect(agentSigner.signTypedData).toHaveBeenCalledTimes(2);
      expect(accountSigner.signTypedData.mock.calls).toStrictEqual([
        [ACCOUNT_ADDRESS, L1_PAYLOAD],
      ]);
      expect(getAgentSigner).toHaveBeenCalledTimes(3);
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

      expect(agentSigner.signTypedData).toHaveBeenCalledWith(L1_PAYLOAD);
    });

    it('retries the referral instead of recording a failure when getAgentSigner rejects', async () => {
      const getAgentSigner = jest
        .fn()
        .mockRejectedValue(new Error('agent store unavailable'));
      const { accountSignerProvider, exchangeClient } =
        createAccountSignerProvider({
          abstraction: 'unifiedAccount',
          getAgentSigner,
        });

      await accountSignerProvider.prepareTradingWallet();

      expect(exchangeClient.setReferrer).toHaveBeenCalledTimes(1);
      expect(referralAttempted()).toBe(false);
      expect(loggerError).not.toHaveBeenCalled();
    });

    it('retries the referral instead of recording a failure when the agent fails to sign', async () => {
      const getAgentSigner = jest.fn();
      const { accountSignerProvider, agentSigner, exchangeClient } =
        createAccountSignerProvider({
          abstraction: 'unifiedAccount',
          getAgentSigner,
        });
      agentSigner.signTypedData.mockRejectedValue(
        new Error('agent key locked'),
      );
      getAgentSigner.mockResolvedValue(agentSigner);

      const result = await accountSignerProvider.prepareTradingWallet();

      expect(result).toStrictEqual({ ready: false });
      expect(exchangeClient.setReferrer).toHaveBeenCalledTimes(1);
      expect(referralAttempted()).toBe(false);
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

      await expect(wallet.signTypedData(L1_PAYLOAD)).rejects.toThrow(
        'HyperLiquid agent signer unavailable',
      );
      await expect(wallet.signTypedData(L1_PAYLOAD)).rejects.toThrow(
        'HyperLiquid agent signer unavailable',
      );
      expect(getAgentSigner).toHaveBeenCalledTimes(2);
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

      expect(getAgentSigner).toHaveBeenCalledTimes(2);
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
      expect(exchangeClient.setReferrer).toHaveBeenCalledTimes(2);
    });

    describe('when the venue rejects the agent', () => {
      const rejection = (address: string): Error =>
        new Error(`User or API Wallet ${address} does not exist.`);

      /**
       * A provider whose L1 writes are signed by the agent, then rejected
       * by the venue as an unknown wallet.
       *
       * @param write - The exchange write that fails.
       * @returns The provider, its mocks and the rejected agent.
       */
      function createRejectingProvider(
        write: 'order' | 'cancel' | 'agentSetAbstraction' | 'setReferrer',
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
        const { accountSignerProvider, agentSigner, onAgentRejected } =
          createRejectingProvider('cancel');
        await accountSignerProvider.getMarketDataWithPrices();

        const result = await accountSignerProvider.cancelOrder({
          orderId: '123',
          symbol: 'BTC',
        });

        expect(result).toStrictEqual(
          expect.objectContaining({
            success: false,
            error: PERPS_ERROR_CODES.KEYRING_LOCKED,
          }),
        );
        expect(onAgentRejected).toHaveBeenCalledWith(
          MAINNET_ACCOUNT,
          agentSigner.address,
        );
        expect(loggerError).not.toHaveBeenCalled();
      });

      it('fails a batch cancel with KEYRING_LOCKED without logging it', async () => {
        const { accountSignerProvider } = createRejectingProvider('cancel');
        await accountSignerProvider.getMarketDataWithPrices();

        const result = await accountSignerProvider.cancelOrders([
          { orderId: '123', symbol: 'BTC' },
          { orderId: '124', symbol: 'BTC' },
        ]);

        expect(result.success).toBe(false);
        expect(result.results.map(({ error }) => error)).toStrictEqual([
          PERPS_ERROR_CODES.KEYRING_LOCKED,
          PERPS_ERROR_CODES.KEYRING_LOCKED,
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

        expect(onAgentRejected.mock.calls).toStrictEqual([
          [MAINNET_ACCOUNT, agentSigner.address],
        ]);
        // The other account's agent stays cached, so it is not asked again.
        expect(getAgentSigner.mock.calls).toStrictEqual([
          [{ mainAddress: OTHER_ACCOUNT_ADDRESS, isTestnet: false }],
          [MAINNET_ACCOUNT],
        ]);
      });

      it('fails the order with KEYRING_LOCKED, drops the agent and asks again', async () => {
        const {
          accountSignerProvider,
          agentSigner,
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

        expect(order).toStrictEqual(
          expect.objectContaining({
            success: false,
            error: PERPS_ERROR_CODES.KEYRING_LOCKED,
          }),
        );
        expect(onAgentRejected).toHaveBeenCalledWith(
          MAINNET_ACCOUNT,
          agentSigner.address,
        );
        expect(getAgentSigner).toHaveBeenCalledTimes(2);
        expect(loggerError).not.toHaveBeenCalled();
      });

      it('retries the silent migration instead of recording no HyperLiquid account', async () => {
        const {
          accountSignerProvider,
          agentSigner,
          onAgentRejected,
          exchangeClient,
        } = createRejectingProvider('agentSetAbstraction');

        await accountSignerProvider.getMarketDataWithPrices();
        await accountSignerProvider.getMarketDataWithPrices();

        expect(exchangeClient.agentSetAbstraction).toHaveBeenCalledTimes(2);
        expect(onAgentRejected).toHaveBeenCalledWith(
          MAINNET_ACCOUNT,
          agentSigner.address,
        );
        expect(trackPerpsEvent).not.toHaveBeenCalledWith(
          'Perp Account Setup',
          expect.objectContaining({ status: 'failed' }),
        );
        expect(migrationAttempted()).toBe(false);
        expect(loggerError).not.toHaveBeenCalled();
      });

      it('retries the referral instead of recording a failure', async () => {
        const {
          accountSignerProvider,
          agentSigner,
          onAgentRejected,
          exchangeClient,
        } = createRejectingProvider('setReferrer');

        const result = await accountSignerProvider.prepareTradingWallet();

        expect(result).toStrictEqual({ ready: false });
        expect(exchangeClient.setReferrer).toHaveBeenCalledTimes(1);
        expect(onAgentRejected).toHaveBeenCalledWith(
          MAINNET_ACCOUNT,
          agentSigner.address,
        );
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

        expect(order).toStrictEqual(
          expect.objectContaining({
            success: false,
            error: PERPS_ERROR_CODES.EXCHANGE_ACCOUNT_NOT_FOUND,
          }),
        );
        expect(onAgentRejected).not.toHaveBeenCalled();
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

      expect(order).toStrictEqual(
        expect.objectContaining({
          success: false,
          error: PERPS_ERROR_CODES.KEYRING_LOCKED,
        }),
      );
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

      await expect(signing).rejects.toThrow(
        'HyperLiquid agent signer unavailable',
      );
      expect(agentSigner.signTypedData).not.toHaveBeenCalled();
    });
  });
});
