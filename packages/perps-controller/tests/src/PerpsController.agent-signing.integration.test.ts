import type { Hex } from '@metamask/utils';

import {
  BUILDER_FEE_CONFIG,
  REFERRAL_CONFIG,
} from '../../src/constants/hyperLiquidConfig.js';
import {
  getDefaultPerpsControllerState,
  PerpsController,
} from '../../src/PerpsController.js';
import type { PerpsControllerMessenger } from '../../src/PerpsController.js';
import { PERPS_ERROR_CODES } from '../../src/perpsErrorCodes.js';
import type { HyperLiquidWalletParams } from '../../src/services/HyperLiquidClientService.js';
import { TradingReadinessCache } from '../../src/services/TradingReadinessCache.js';
import { HL_ABSTRACTION_WIRE } from '../../src/types/hyperliquid-types.js';
import type {
  HyperLiquidCredentials,
  OrderResult,
  PerpsAccountSigner,
  PerpsAgentAccount,
  PerpsAgentSigner,
  PerpsTypedDataPayload,
} from '../../src/types/index.js';
import {
  AGENT_ADDRESS,
  AGENT_SIGNATURE,
  APPROVE_BUILDER_FEE_PAYLOAD,
  L1_PAYLOAD,
  MAIN_ADDRESS,
  MAIN_SIGNATURE,
  MAINNET_ACCOUNT,
  OTHER_AGENT_ADDRESS,
  OTHER_AGENT_SIGNATURE,
  signThroughWallet,
  TESTNET_ACCOUNT,
  unknownWalletError,
  USER_SIGNED_PAYLOAD,
} from '../helpers/agentFixtures.js';
import { createMockInfoClient } from '../helpers/providerMocks.js';
import {
  createKeyringlessMessenger,
  createKeyringMessenger,
  createMockInfrastructure,
  keyringCalls,
} from '../helpers/serviceMocks.js';

// The venue recovers each signer from its signature.
const SIGNERS = new Map<string, Hex>([
  [MAIN_SIGNATURE, MAIN_ADDRESS],
  [AGENT_SIGNATURE, AGENT_ADDRESS],
  [OTHER_AGENT_SIGNATURE, OTHER_AGENT_ADDRESS],
]);
const OK_RESPONSE = { status: 'ok' } as const;
// What the controller returns for an order the fake venue rests, unfilled.
const PLACED_ORDER: OrderResult = {
  success: true,
  orderId: '7',
  submittedSize: '0.1',
  filledSize: undefined,
  averagePrice: undefined,
};

type VenueWrite = {
  write: string;
  params: unknown;
  signer: Hex | undefined;
};

// What the fake venue saw, and the agents it no longer knows.
const mockVenue = {
  infoClient: createMockInfoClient(),
  networks: [] as string[],
  writes: [] as VenueWrite[],
  revokedAgents: new Set<Hex>(),
};

class MockHttpTransport {
  constructor({ isTestnet }: { isTestnet: boolean }) {
    mockVenue.networks.push(isTestnet ? 'testnet' : 'mainnet');
  }
}

class MockWebSocketTransport {
  readonly socket = { addEventListener: (): void => undefined };

  async ready(): Promise<void> {
    // Connected at once.
  }

  close(): void {
    // Nothing to release.
  }
}

// Every write signs its action through the wallet adapter the client was
// built with, as the SDK does, and the venue rejects a revoked agent's
// signature as an unknown wallet.
class MockExchangeClient {
  readonly #wallet: HyperLiquidWalletParams;

  constructor({ wallet }: { wallet: HyperLiquidWalletParams }) {
    this.#wallet = wallet;
  }

  async order(params: unknown): Promise<unknown> {
    await this.#write('order', params, L1_PAYLOAD);
    return {
      status: 'ok',
      response: {
        type: 'order',
        data: { statuses: [{ resting: { oid: 7 } }] },
      },
    };
  }

  async cancel(params: unknown): Promise<unknown> {
    await this.#write('cancel', params, L1_PAYLOAD);
    return {
      status: 'ok',
      response: { type: 'cancel', data: { statuses: ['success'] } },
    };
  }

  async setReferrer(params: unknown): Promise<unknown> {
    await this.#write('setReferrer', params, L1_PAYLOAD);
    return OK_RESPONSE;
  }

  async agentSetAbstraction(params: unknown): Promise<unknown> {
    await this.#write('agentSetAbstraction', params, L1_PAYLOAD);
    return OK_RESPONSE;
  }

  async userSetAbstraction(params: unknown): Promise<unknown> {
    await this.#write('userSetAbstraction', params, USER_SIGNED_PAYLOAD);
    return OK_RESPONSE;
  }

  async approveBuilderFee(params: unknown): Promise<unknown> {
    await this.#write('approveBuilderFee', params, APPROVE_BUILDER_FEE_PAYLOAD);
    return OK_RESPONSE;
  }

  async #write(
    write: string,
    params: unknown,
    payload: PerpsTypedDataPayload,
  ): Promise<void> {
    const signer = SIGNERS.get(await signThroughWallet(this.#wallet, payload));
    mockVenue.writes.push({ write, params, signer });
    if (signer && mockVenue.revokedAgents.has(signer)) {
      throw unknownWalletError(signer);
    }
  }
}

// The controller builds a real HyperLiquidProvider, wallet service, client
// service and subscription service; only the SDK is faked. Nothing in these
// flows subscribes, so the fake SubscriptionClient has no methods. Jest
// hoists this above the imports; the fakes are only built once a test runs.
jest.mock('@nktkas/hyperliquid', () => ({
  // The provider tells SDK errors apart with instanceof.
  HyperliquidError: class HyperliquidError extends Error {},
  HttpTransport: function HttpTransport(options: {
    isTestnet: boolean;
  }): MockHttpTransport {
    return new MockHttpTransport(options);
  },
  WebSocketTransport: function WebSocketTransport(): MockWebSocketTransport {
    return new MockWebSocketTransport();
  },
  InfoClient: function InfoClient(): typeof mockVenue.infoClient {
    return mockVenue.infoClient;
  },
  SubscriptionClient: function SubscriptionClient(options: {
    transport: MockWebSocketTransport;
  }): { config_: { transport: MockWebSocketTransport } } {
    return { config_: options };
  },
  ExchangeClient: function ExchangeClient(options: {
    wallet: HyperLiquidWalletParams;
  }): MockExchangeClient {
    return new MockExchangeClient(options);
  },
}));

describe('PerpsController agent signing with a real HyperLiquid provider', () => {
  let accountSigner: {
    signTypedData: jest.Mock;
    signPersonalMessage: jest.Mock;
  };
  let agentSigner: PerpsAgentSigner & { signTypedData: jest.Mock };
  let getAgentSigner: jest.Mock;
  let onAgentRejected: jest.Mock;
  let infrastructure: ReturnType<typeof createMockInfrastructure>;
  let loggerError: jest.SpyInstance;

  beforeEach(() => {
    TradingReadinessCache.clearAll();
    // An account already on the unified account, with the builder fee
    // approved and the referral set, so only the tested write signs.
    mockVenue.infoClient = createMockInfoClient({
      // MetaMask's referral code is ready on each network.
      referral: jest.fn(async ({ user }: { user: string }) => ({
        referredBy: { code: REFERRAL_CONFIG.MainnetCode },
        referrerState: {
          stage: 'ready',
          data: {
            code:
              user === BUILDER_FEE_CONFIG.TestnetBuilder
                ? REFERRAL_CONFIG.TestnetCode
                : REFERRAL_CONFIG.MainnetCode,
          },
        },
      })),
    });
    mockVenue.networks = [];
    mockVenue.writes = [];
    mockVenue.revokedAgents.clear();
    accountSigner = {
      signTypedData: jest.fn().mockResolvedValue(MAIN_SIGNATURE),
      signPersonalMessage: jest.fn(),
    };
    agentSigner = createAgent(AGENT_ADDRESS, AGENT_SIGNATURE);
    getAgentSigner = jest.fn().mockResolvedValue(agentSigner);
    onAgentRejected = jest.fn();
    infrastructure = createMockInfrastructure();
    loggerError = jest.spyOn(infrastructure.logger, 'error');
  });

  /**
   * A real host messenger. It delegates only what the host answers: the
   * selected account, an empty remote feature flag state (so the controller
   * reads its defaults), the network the fee discount looks up, no synced
   * watchlist, no data-lake session (so orders are not reported) and, with
   * `keyring`, the KeyringController that signs as the main account. Any
   * other action throws.
   *
   * @param keyring - The KeyringController the host exposes, if any.
   * @param keyring.isUnlocked - Whether the keyring is unlocked.
   * @returns The messenger and a spy on its `call`.
   */
  function createHost(keyring?: { isUnlocked: boolean }): {
    messenger: PerpsControllerMessenger;
    call: jest.SpyInstance;
  } {
    const { messenger, rootMessenger, call } = keyring
      ? createKeyringMessenger(MAIN_SIGNATURE, keyring.isUnlocked)
      : createKeyringlessMessenger();
    rootMessenger.registerActionHandler(
      'RemoteFeatureFlagController:getState',
      () => ({ remoteFeatureFlags: {}, cacheTimestamp: 0 }),
    );
    rootMessenger.registerActionHandler(
      'NetworkController:getState',
      jest.fn().mockReturnValue({ selectedNetworkClientId: 'mainnet' }),
    );
    rootMessenger.registerActionHandler(
      'NetworkController:getNetworkClientById',
      jest.fn().mockReturnValue({ configuration: { chainId: '0x1' } }),
    );
    rootMessenger.registerActionHandler(
      'AuthenticatedUserStorageService:getNotificationPreferences',
      async () => null,
    );
    rootMessenger.registerActionHandler(
      'AuthenticationController:getBearerToken',
      async () => '',
    );
    rootMessenger.delegate({
      actions: [
        'RemoteFeatureFlagController:getState',
        'NetworkController:getState',
        'NetworkController:getNetworkClientById',
        'AuthenticatedUserStorageService:getNotificationPreferences',
        'AuthenticationController:getBearerToken',
      ],
      events: [
        'RemoteFeatureFlagController:stateChange',
        'AccountsController:selectedAccountChange',
        'AccountTreeController:selectedAccountGroupChange',
      ],
      messenger,
    });
    return { messenger, call };
  }

  /**
   * Build a controller whose host signs with `accountSigner` and resolves
   * agents with `getAgentSigner`, unless told otherwise.
   *
   * @param options - What the host provides.
   * @param options.signer - The host's account signer; null for a host that
   * signs through its KeyringController.
   * @param options.hyperliquid - The host's HyperLiquid credentials.
   * @param options.host - The host's messenger.
   * @returns The controller and a spy on the host messenger's `call`.
   */
  function createController({
    signer = accountSigner,
    hyperliquid = { getAgentSigner, onAgentRejected },
    host = createHost(),
  }: {
    signer?: PerpsAccountSigner | null;
    hyperliquid?: HyperLiquidCredentials;
    host?: ReturnType<typeof createHost>;
  } = {}): { controller: PerpsController; call: jest.SpyInstance } {
    const controller = new PerpsController({
      messenger: host.messenger,
      state: getDefaultPerpsControllerState(),
      clientConfig: { providerCredentials: { hyperliquid } },
      infrastructure: signer
        ? { ...infrastructure, accountSigner: signer }
        : infrastructure,
      deferEligibilityCheck: true,
    });
    return { controller, call: host.call };
  }

  /**
   * Assert the KeyringController actions a flow called, and that it reported
   * no error.
   *
   * @param call - A spy on the host messenger's `call`.
   * @param keyringActions - The KeyringController actions called; a host with
   * an account signer has none.
   */
  function expectQuietHost(
    call: jest.SpyInstance,
    keyringActions: string[] = [],
  ): void {
    expect(keyringCalls(call)).toStrictEqual(keyringActions);
    expect(loggerError).not.toHaveBeenCalled();
  }

  /**
   * Assert what a host with both agent callbacks saw during a flow: the
   * accounts `getAgentSigner` was asked for, the agents reported to
   * `onAgentRejected`, the KeyringController actions called, and no reported
   * error.
   *
   * @param call - A spy on the host messenger's `call`.
   * @param expected - What the host saw.
   * @param expected.agentRequests - The accounts `getAgentSigner` was asked
   * for, in order.
   * @param expected.rejectedAgents - The account and agent of each rejection.
   * @param expected.keyringActions - The KeyringController actions called; a
   * host with an account signer has none.
   */
  function expectHostSaw(
    call: jest.SpyInstance,
    {
      agentRequests,
      rejectedAgents = [],
      keyringActions = [],
    }: {
      agentRequests: PerpsAgentAccount[];
      rejectedAgents?: [PerpsAgentAccount, Hex][];
      keyringActions?: string[];
    },
  ): void {
    expect(getAgentSigner.mock.calls).toStrictEqual(
      agentRequests.map((account) => [account]),
    );
    expect(onAgentRejected.mock.calls).toStrictEqual(rejectedAgents);
    expectQuietHost(call, keyringActions);
  }

  /**
   * An agent that signs with its own recognizable signature.
   *
   * @param address - The agent's address.
   * @param signature - The signature it returns.
   * @returns The agent signer.
   */
  function createAgent(
    address: Hex,
    signature: Hex,
  ): PerpsAgentSigner & { signTypedData: jest.Mock } {
    return {
      address,
      signTypedData: jest.fn().mockResolvedValue(signature),
    };
  }

  /**
   * Place a BTC market buy through the controller.
   *
   * @param controller - The initialized controller.
   * @returns The order result.
   */
  async function placeOrder(controller: PerpsController): Promise<OrderResult> {
    return await controller.placeOrder({
      symbol: 'BTC',
      isBuy: true,
      size: '0.1',
      orderType: 'market',
      currentPrice: 50000,
    });
  }

  /**
   * The writes the venue saw, with who signed each.
   *
   * @returns The write names and signers, in order.
   */
  function signedWrites(): [string, Hex | undefined][] {
    return mockVenue.writes.map(({ write, signer }) => [write, signer]);
  }

  it("signs L1 actions with the host's agent and user-signed actions with the main account", async () => {
    // The builder fee is not approved yet, so the first order approves it.
    mockVenue.infoClient.maxBuilderFee.mockResolvedValueOnce(0);
    const { controller, call } = createController();
    await controller.init();

    const placed = await placeOrder(controller);

    expect(placed).toStrictEqual(PLACED_ORDER);
    expect(signedWrites()).toStrictEqual([
      ['approveBuilderFee', MAIN_ADDRESS],
      ['order', AGENT_ADDRESS],
    ]);
    expect(agentSigner.signTypedData.mock.calls).toStrictEqual([[L1_PAYLOAD]]);
    expect(accountSigner.signTypedData.mock.calls).toStrictEqual([
      [MAIN_ADDRESS, APPROVE_BUILDER_FEE_PAYLOAD],
    ]);
    expectHostSaw(call, { agentRequests: [MAINNET_ACCOUNT] });
  });

  it('signs the silent unified-account migration with the agent, and nothing with the main account', async () => {
    // An account in default mode, which the agent migrates without a prompt.
    mockVenue.infoClient.userAbstraction.mockResolvedValue('default');
    const { controller, call } = createController();
    await controller.init();

    const result = await controller.prepareTradingWallet();

    expect(result).toStrictEqual({ ready: true });
    expect(mockVenue.writes).toStrictEqual([
      {
        write: 'agentSetAbstraction',
        params: { abstraction: HL_ABSTRACTION_WIRE.unifiedAccount },
        signer: AGENT_ADDRESS,
      },
    ]);
    expect(agentSigner.signTypedData.mock.calls).toStrictEqual([[L1_PAYLOAD]]);
    expect(accountSigner.signTypedData).not.toHaveBeenCalled();
    expectHostSaw(call, { agentRequests: [MAINNET_ACCOUNT] });
  });

  it('signs L1 actions with the main account when the host has no getAgentSigner', async () => {
    const { controller, call } = createController({ hyperliquid: {} });
    await controller.init();

    const placed = await placeOrder(controller);

    expect(placed).toStrictEqual(PLACED_ORDER);
    expect(signedWrites()).toStrictEqual([['order', MAIN_ADDRESS]]);
    expect(accountSigner.signTypedData.mock.calls).toStrictEqual([
      [MAIN_ADDRESS, L1_PAYLOAD],
    ]);
    // The host has no agent callbacks to observe.
    expectQuietHost(call);
  });

  it('signs L1 actions with the agent and user-signed actions through KeyringController for a host without accountSigner', async () => {
    // The builder fee is not approved yet, so the first order approves it.
    mockVenue.infoClient.maxBuilderFee.mockResolvedValueOnce(0);
    const { controller, call } = createController({
      signer: null,
      host: createHost({ isUnlocked: true }),
    });
    await controller.init();

    const placed = await placeOrder(controller);

    expect(placed).toStrictEqual(PLACED_ORDER);
    expect(signedWrites()).toStrictEqual([
      ['approveBuilderFee', MAIN_ADDRESS],
      ['order', AGENT_ADDRESS],
    ]);
    expect(
      call.mock.calls.filter(
        ([action]) => action === 'KeyringController:signTypedMessage',
      ),
    ).toStrictEqual([
      [
        'KeyringController:signTypedMessage',
        { from: MAIN_ADDRESS, data: APPROVE_BUILDER_FEE_PAYLOAD },
        'V4',
      ],
    ]);
    expect(agentSigner.signTypedData.mock.calls).toStrictEqual([[L1_PAYLOAD]]);
    expectHostSaw(call, {
      agentRequests: [MAINNET_ACCOUNT],
      keyringActions: [
        'KeyringController:getState',
        'KeyringController:getState',
        'KeyringController:signTypedMessage',
      ],
    });
  });

  it('prepares nothing and reports KEYRING_LOCKED while the host keyring is locked', async () => {
    const { controller, call } = createController({
      signer: null,
      host: createHost({ isUnlocked: false }),
    });
    await controller.init();

    const result = await controller.prepareTradingWallet();

    expect(result).toStrictEqual({
      ready: false,
      error: PERPS_ERROR_CODES.KEYRING_LOCKED,
    });
    expect(mockVenue.networks).toStrictEqual([]);
    expect(mockVenue.writes).toStrictEqual([]);
    expectHostSaw(call, {
      agentRequests: [],
      keyringActions: ['KeyringController:getState'],
    });
  });

  it('pins L1 actions to the main account with setAgentSigner(null) until clearAgentSigners', async () => {
    const { controller, call } = createController();
    await controller.init();

    controller.setAgentSigner(MAINNET_ACCOUNT, null);
    const pinnedPlaced = await placeOrder(controller);
    controller.clearAgentSigners();
    const clearedPlaced = await placeOrder(controller);

    expect([pinnedPlaced, clearedPlaced]).toStrictEqual([
      PLACED_ORDER,
      PLACED_ORDER,
    ]);
    expect(signedWrites()).toStrictEqual([
      ['order', MAIN_ADDRESS],
      ['order', AGENT_ADDRESS],
    ]);
    expectHostSaw(call, { agentRequests: [MAINNET_ACCOUNT] });
  });

  it('keeps a setAgentSigner binding when the HyperLiquid provider is re-created', async () => {
    getAgentSigner.mockResolvedValue(null);
    const boundAgent = createAgent(OTHER_AGENT_ADDRESS, OTHER_AGENT_SIGNATURE);
    const { controller, call } = createController();
    await controller.init();
    controller.setAgentSigner(MAINNET_ACCOUNT, boundAgent);

    const placedBefore = await placeOrder(controller);
    await controller.toggleTestnet();
    const placedOnTestnet = await placeOrder(controller);
    await controller.toggleTestnet();
    const placedAfter = await placeOrder(controller);

    expect([placedBefore, placedOnTestnet, placedAfter]).toStrictEqual([
      PLACED_ORDER,
      PLACED_ORDER,
      PLACED_ORDER,
    ]);
    // Each provider built its own SDK clients.
    expect(mockVenue.networks).toStrictEqual(['mainnet', 'testnet', 'mainnet']);
    // The binding is for mainnet only: on testnet the host has no agent, so
    // the main account signs.
    expect(signedWrites()).toStrictEqual([
      ['order', OTHER_AGENT_ADDRESS],
      ['order', MAIN_ADDRESS],
      ['order', OTHER_AGENT_ADDRESS],
    ]);
    expect(accountSigner.signTypedData.mock.calls).toStrictEqual([
      [MAIN_ADDRESS, L1_PAYLOAD],
    ]);
    expectHostSaw(call, {
      agentRequests: [TESTNET_ACCOUNT],
    });
  });

  it('honors a setAgentSigner binding made before init', async () => {
    getAgentSigner.mockResolvedValue(null);
    const boundAgent = createAgent(OTHER_AGENT_ADDRESS, OTHER_AGENT_SIGNATURE);
    const { controller, call } = createController();

    controller.setAgentSigner(MAINNET_ACCOUNT, boundAgent);
    await controller.init();
    const placed = await placeOrder(controller);

    expect(placed).toStrictEqual(PLACED_ORDER);
    expect(signedWrites()).toStrictEqual([['order', OTHER_AGENT_ADDRESS]]);
    expectHostSaw(call, { agentRequests: [] });
  });

  it('forgets a setAgentSigner binding cleared before init', async () => {
    const boundAgent = createAgent(OTHER_AGENT_ADDRESS, OTHER_AGENT_SIGNATURE);
    const { controller, call } = createController();
    controller.setAgentSigner(MAINNET_ACCOUNT, boundAgent);

    controller.clearAgentSigners();
    await controller.init();
    const placed = await placeOrder(controller);

    expect(placed).toStrictEqual(PLACED_ORDER);
    expect(signedWrites()).toStrictEqual([['order', AGENT_ADDRESS]]);
    expect(boundAgent.signTypedData).not.toHaveBeenCalled();
    expectHostSaw(call, { agentRequests: [MAINNET_ACCOUNT] });
  });

  it('signs with the agent bound through setAgentSigner after another was resolved', async () => {
    const reboundAgent = createAgent(
      OTHER_AGENT_ADDRESS,
      OTHER_AGENT_SIGNATURE,
    );
    const { controller, call } = createController();
    await controller.init();

    const resolvedPlaced = await placeOrder(controller);
    controller.setAgentSigner(MAINNET_ACCOUNT, reboundAgent);
    const reboundPlaced = await placeOrder(controller);
    controller.setAgentSigner(MAINNET_ACCOUNT, null);
    const pinnedPlaced = await placeOrder(controller);

    expect([resolvedPlaced, reboundPlaced, pinnedPlaced]).toStrictEqual([
      PLACED_ORDER,
      PLACED_ORDER,
      PLACED_ORDER,
    ]);
    expect(signedWrites()).toStrictEqual([
      ['order', AGENT_ADDRESS],
      ['order', OTHER_AGENT_ADDRESS],
      ['order', MAIN_ADDRESS],
    ]);
    expectHostSaw(call, { agentRequests: [MAINNET_ACCOUNT] });
  });

  it('tells the host about an agent the venue rejects and asks for another', async () => {
    const replacementAgent = createAgent(
      OTHER_AGENT_ADDRESS,
      OTHER_AGENT_SIGNATURE,
    );
    getAgentSigner
      .mockResolvedValueOnce(agentSigner)
      .mockResolvedValueOnce(replacementAgent);
    mockVenue.revokedAgents.add(AGENT_ADDRESS);
    const { controller, call } = createController();
    await controller.init();

    const cancelled = await controller.cancelOrder({
      orderId: '1',
      symbol: 'BTC',
    });
    const placed = await placeOrder(controller);

    expect(cancelled).toStrictEqual({
      success: false,
      orderId: '1',
      error: PERPS_ERROR_CODES.KEYRING_LOCKED,
    });
    expect(placed).toStrictEqual(PLACED_ORDER);
    expect(signedWrites()).toStrictEqual([
      ['cancel', AGENT_ADDRESS],
      ['order', OTHER_AGENT_ADDRESS],
    ]);
    expectHostSaw(call, {
      agentRequests: [MAINNET_ACCOUNT, MAINNET_ACCOUNT],
      rejectedAgents: [[MAINNET_ACCOUNT, AGENT_ADDRESS]],
    });
  });

  it('releases a setAgentSigner binding to an agent the venue rejects', async () => {
    const boundAgent = createAgent(OTHER_AGENT_ADDRESS, OTHER_AGENT_SIGNATURE);
    mockVenue.revokedAgents.add(OTHER_AGENT_ADDRESS);
    const { controller, call } = createController();
    await controller.init();
    controller.setAgentSigner(MAINNET_ACCOUNT, boundAgent);

    const cancelled = await controller.cancelOrder({
      orderId: '1',
      symbol: 'BTC',
    });
    const placed = await placeOrder(controller);

    expect(cancelled).toStrictEqual({
      success: false,
      orderId: '1',
      error: PERPS_ERROR_CODES.KEYRING_LOCKED,
    });
    // The binding is gone, so the host's getAgentSigner answers.
    expect(placed).toStrictEqual(PLACED_ORDER);
    expect(signedWrites()).toStrictEqual([
      ['cancel', OTHER_AGENT_ADDRESS],
      ['order', AGENT_ADDRESS],
    ]);
    expectHostSaw(call, {
      agentRequests: [MAINNET_ACCOUNT],
      rejectedAgents: [[MAINNET_ACCOUNT, OTHER_AGENT_ADDRESS]],
    });
  });

  // Hosts whose onAgentRejected does not take the rejection: it throws, or
  // there is none.
  const REJECTION_HOSTS: {
    host: string;
    credentials: () => HyperLiquidCredentials;
    rejectedAgents: [PerpsAgentAccount, Hex][];
  }[] = [
    {
      host: 'whose onAgentRejected throws',
      credentials: (): HyperLiquidCredentials => ({
        getAgentSigner,
        onAgentRejected: onAgentRejected.mockImplementation(() => {
          throw new Error('host callback failed');
        }),
      }),
      rejectedAgents: [[MAINNET_ACCOUNT, OTHER_AGENT_ADDRESS]],
    },
    {
      host: 'without onAgentRejected',
      credentials: (): HyperLiquidCredentials => ({ getAgentSigner }),
      // The suite's onAgentRejected is not wired, so it stays uncalled.
      rejectedAgents: [],
    },
  ];

  it.each(REJECTION_HOSTS)(
    'releases a binding to an agent the venue rejects for a host $host',
    async ({ credentials, rejectedAgents }) => {
      const boundAgent = createAgent(
        OTHER_AGENT_ADDRESS,
        OTHER_AGENT_SIGNATURE,
      );
      mockVenue.revokedAgents.add(OTHER_AGENT_ADDRESS);
      const { controller, call } = createController({
        hyperliquid: credentials(),
      });
      await controller.init();
      controller.setAgentSigner(MAINNET_ACCOUNT, boundAgent);

      const cancelled = await controller.cancelOrder({
        orderId: '1',
        symbol: 'BTC',
      });
      const placed = await placeOrder(controller);

      expect(cancelled).toStrictEqual({
        success: false,
        orderId: '1',
        error: PERPS_ERROR_CODES.KEYRING_LOCKED,
      });
      // The binding is gone, so the host's getAgentSigner answers.
      expect(placed).toStrictEqual(PLACED_ORDER);
      expect(signedWrites()).toStrictEqual([
        ['cancel', OTHER_AGENT_ADDRESS],
        ['order', AGENT_ADDRESS],
      ]);
      expectHostSaw(call, {
        agentRequests: [MAINNET_ACCOUNT],
        rejectedAgents,
      });
    },
  );

  it('prepares nothing and reports KEYRING_LOCKED while the account signer is not ready', async () => {
    const { controller, call } = createController({
      signer: { ...accountSigner, isReady: (): boolean => false },
    });
    await controller.init();

    const result = await controller.prepareTradingWallet();

    expect(result).toStrictEqual({
      ready: false,
      error: PERPS_ERROR_CODES.KEYRING_LOCKED,
    });
    expect(mockVenue.networks).toStrictEqual([]);
    expect(mockVenue.writes).toStrictEqual([]);
    expect(accountSigner.signTypedData).not.toHaveBeenCalled();
    expectHostSaw(call, { agentRequests: [] });
  });

  it('prepares the migration and builder fee on the main account and the referral on the agent', async () => {
    // A legacy account with no referral that has not approved the builder
    // fee yet.
    mockVenue.infoClient = createMockInfoClient({
      userAbstraction: jest.fn().mockResolvedValue('dexAbstraction'),
      maxBuilderFee: jest.fn().mockResolvedValueOnce(0).mockResolvedValue(1),
    });
    const { controller, call } = createController();
    await controller.init();

    const result = await controller.prepareTradingWallet();

    expect(result).toStrictEqual({ ready: true });
    // The user-signed migration and approval stay on the main account; the
    // referral is an L1 action, so the agent signs it.
    expect(mockVenue.writes).toStrictEqual([
      {
        write: 'userSetAbstraction',
        params: { user: MAIN_ADDRESS, abstraction: 'unifiedAccount' },
        signer: MAIN_ADDRESS,
      },
      {
        write: 'setReferrer',
        params: { code: REFERRAL_CONFIG.MainnetCode },
        signer: AGENT_ADDRESS,
      },
      {
        write: 'approveBuilderFee',
        params: {
          builder: BUILDER_FEE_CONFIG.MainnetBuilder,
          maxFeeRate: BUILDER_FEE_CONFIG.MaxFeeRate,
        },
        signer: MAIN_ADDRESS,
      },
    ]);
    expect(accountSigner.signTypedData.mock.calls).toStrictEqual([
      [MAIN_ADDRESS, USER_SIGNED_PAYLOAD],
      [MAIN_ADDRESS, APPROVE_BUILDER_FEE_PAYLOAD],
    ]);
    expect(agentSigner.signTypedData.mock.calls).toStrictEqual([[L1_PAYLOAD]]);
    expectHostSaw(call, { agentRequests: [MAINNET_ACCOUNT] });
  });
});
