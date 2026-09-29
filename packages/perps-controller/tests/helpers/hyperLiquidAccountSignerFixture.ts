/**
 * The shared fixture of the HyperLiquidProvider account-signer tests: a real
 * provider, wallet service and signing caches over mocked client and
 * subscription services.
 *
 * Every test file that uses it must mock both services itself, since
 * jest.mock is hoisted per file:
 *
 * jest.mock('../../../src/services/HyperLiquidClientService');
 * jest.mock('../../../src/services/HyperLiquidSubscriptionService');
 */
import type { Hex } from '@metamask/utils';

import {
  BUILDER_FEE_CONFIG,
  REFERRAL_CONFIG,
} from '../../src/constants/hyperLiquidConfig.js';
import { HyperLiquidProvider } from '../../src/providers/HyperLiquidProvider.js';
import type { AgentBindings } from '../../src/services/agentSigner.js';
import { HyperLiquidClientService } from '../../src/services/HyperLiquidClientService.js';
import type { HyperLiquidWalletParams } from '../../src/services/HyperLiquidClientService.js';
import { HyperLiquidSubscriptionService } from '../../src/services/HyperLiquidSubscriptionService.js';
import {
  PerpsSigningCache,
  TradingReadinessCache,
} from '../../src/services/TradingReadinessCache.js';
import {
  HL_ABSTRACTION_WIRE,
  HL_UNIFIED_ACCOUNT_MODE,
} from '../../src/types/hyperliquid-types.js';
import type {
  HyperLiquidCredentials,
  PerpsAgentAccount,
  PerpsAgentSigner,
  PerpsPlatformDependencies,
  PerpsTypedDataPayload,
} from '../../src/types/index.js';
import {
  AGENT_ADDRESS,
  AGENT_SIGNATURE,
  APPROVE_BUILDER_FEE_PAYLOAD,
  L1_PAYLOAD,
  MAIN_SIGNATURE,
  USER_SIGNED_PAYLOAD,
  signThroughWallet,
} from './agentFixtures.js';
import {
  createMockExchangeClient,
  createMockInfoClient,
} from './providerMocks.js';
import {
  createDeferred,
  createKeyringMessenger,
  createKeyringlessMessenger,
  createMockEvmAccount,
  createMockInfrastructure,
} from './serviceMocks.js';

const CACHED_PRICES: Record<string, string> = { BTC: '50000', ETH: '3000' };

const MockedHyperLiquidClientService =
  HyperLiquidClientService as jest.MockedClass<typeof HyperLiquidClientService>;
const MockedHyperLiquidSubscriptionService =
  HyperLiquidSubscriptionService as jest.MockedClass<
    typeof HyperLiquidSubscriptionService
  >;

// The wallet service and the signing caches are real. By default the
// messenger has no KeyringController (the `keyring` option adds one), so every
// main-account signature must reach the injected accountSigner. The SDK
// exchange client is the mocked boundary: like the SDK, it signs through the
// wallet the provider initialized it with.
export const ACCOUNT_ADDRESS = createMockEvmAccount().address;

// The selected account on mainnet, as getAgentSigner is asked for it.
export const MAINNET_ACCOUNT = {
  mainAddress: ACCOUNT_ADDRESS,
  isTestnet: false,
} as const;

// A fixed clock for cache timestamps.
export const NOW = 1_700_000_000_000;

export const BTC_MARKET_ORDER = {
  symbol: 'BTC',
  isBuy: true,
  size: '0.1',
  orderType: 'market',
  currentPrice: 50000,
} as const;

// The SDK writes the provider makes for the selected account on mainnet.
export const MIGRATION_WRITE = [
  { user: ACCOUNT_ADDRESS, abstraction: HL_UNIFIED_ACCOUNT_MODE },
];
export const SILENT_MIGRATION_WRITE = [
  { abstraction: HL_ABSTRACTION_WIRE.unifiedAccount },
];
export const REFERRAL_WRITE = [{ code: REFERRAL_CONFIG.MainnetCode }];
export const BUILDER_REFERRAL_LOOKUP = [
  { user: BUILDER_FEE_CONFIG.MainnetBuilder },
];
export const BUILDER_FEE_WRITE = [
  {
    builder: BUILDER_FEE_CONFIG.MainnetBuilder,
    maxFeeRate: BUILDER_FEE_CONFIG.MaxFeeRate,
  },
];

/**
 * The order ID a placement returned.
 *
 * @param result - The placement result.
 * @param result.orderId - Its order ID, if any.
 * @returns The order ID.
 */
export function orderIdOf(result: { orderId?: string }): string {
  if (result.orderId === undefined) {
    throw new Error('The placement returned no order ID');
  }
  return result.orderId;
}

/**
 * Whether the unified-account migration is recorded as attempted for the
 * selected account on mainnet.
 *
 * @returns True once the migration result is cached.
 */
export function migrationAttempted(): boolean {
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
export function referralAttempted(): boolean {
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
export function createPendingResolver(): {
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

/**
 * Bind an agent the way PerpsController.setAgentSigner does: record the
 * binding, then drop the agents the provider already resolved.
 *
 * @param provider - The provider signing L1 actions.
 * @param bindings - The bindings its resolver reads.
 * @param account - The main account and network.
 * @param agentSigner - The agent, or null to pin the main account.
 */
export function bind(
  provider: HyperLiquidProvider,
  bindings: AgentBindings,
  account: PerpsAgentAccount,
  agentSigner: PerpsAgentSigner | null,
): void {
  bindings.set(account, agentSigner);
  provider.clearAgentSigners();
}

export type AccountSignerSuite = {
  mockClientService: jest.Mocked<HyperLiquidClientService>;
  loggerError: jest.SpyInstance;
  trackPerpsEvent: jest.SpyInstance;
};

let suite:
  | {
      mockClientService: jest.Mocked<HyperLiquidClientService>;
      mockPlatformDependencies: PerpsPlatformDependencies;
    }
  | undefined;

/**
 * Reset the signing caches and the mocked client and subscription services
 * for one test. Call it from each test file's beforeEach.
 *
 * @returns The mocks the tests assert on.
 */
export function setUpAccountSignerSuite(): AccountSignerSuite {
  TradingReadinessCache.clearAll();
  const mockPlatformDependencies = createMockInfrastructure();
  const loggerError = jest.spyOn(mockPlatformDependencies.logger, 'error');
  const trackPerpsEvent = jest.spyOn(
    mockPlatformDependencies.metrics,
    'trackPerpsEvent',
  );
  const mockClientService = {
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
  suite = { mockClientService, mockPlatformDependencies };
  return { mockClientService, loggerError, trackPerpsEvent };
}

export type AccountSignerOptions = {
  signer?: {
    isReady?: () => boolean;
    requiresSignatureConfirmation?: () => boolean;
  };
  abstraction?: 'dexAbstraction' | 'default' | 'unifiedAccount';
  getAgentSigner?: HyperLiquidCredentials['getAgentSigner'];
  onAgentRejected?: jest.Mock;
  // Sign through a KeyringController instead of accountSigner.
  keyring?: boolean;
  // Build the provider for testnet.
  isTestnet?: boolean;
  // Extra SDK client methods, for the strategy order endpoints.
  exchange?: Record<string, jest.Mock>;
  info?: Record<string, jest.Mock>;
};

export type AccountSignerFixture = {
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
  // The wallet the provider last initialized the SDK clients with.
  sdkWallet: () => HyperLiquidWalletParams;
  selectAccount: (address: Hex) => void;
  deselectAccount: () => void;
};

/**
 * Build a provider on the suite's mocks, whose SDK exchange client signs its
 * writes through the wallet the provider initializes it with.
 *
 * @param options - How the host and the venue are set up.
 * @returns The provider and its mocks.
 */
export function createAccountSignerProvider(
  options: AccountSignerOptions = {},
): AccountSignerFixture {
  if (!suite) {
    throw new Error('Call setUpAccountSignerSuite in beforeEach first');
  }
  const { mockClientService, mockPlatformDependencies } = suite;
  const accountSigner = {
    signTypedData: jest.fn().mockResolvedValue(MAIN_SIGNATURE),
    signPersonalMessage: jest.fn(),
    ...options.signer,
  };
  const agentSigner = {
    address: AGENT_ADDRESS,
    signTypedData: jest.fn().mockResolvedValue(AGENT_SIGNATURE),
  };
  const { messenger, call, selectAccount, deselectAccount } = options.keyring
    ? createKeyringMessenger(MAIN_SIGNATURE)
    : createKeyringlessMessenger();
  let wallet: HyperLiquidWalletParams | undefined;
  const initialize = jest.fn(async (initialized: HyperLiquidWalletParams) => {
    wallet = initialized;
  });
  const sdkWallet = (): HyperLiquidWalletParams => {
    if (!wallet) {
      throw new Error('SDK used before initialize');
    }
    return wallet;
  };
  const signThroughSdkWallet =
    (
      payload: PerpsTypedDataPayload,
      response: Record<string, unknown> = { status: 'ok' },
    ): (() => Promise<Record<string, unknown>>) =>
    async () => {
      await signThroughWallet(sdkWallet(), payload);
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
    isTestnet: options.isTestnet,
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
    sdkWallet,
    selectAccount,
    deselectAccount,
  };
}
