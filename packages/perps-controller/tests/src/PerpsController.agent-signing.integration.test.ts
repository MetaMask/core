import type { Hex } from '@metamask/utils';

import {
  BUILDER_FEE_CONFIG,
  REFERRAL_CONFIG,
} from '../../src/constants/hyperLiquidConfig.js';
import {
  getDefaultPerpsControllerState,
  PerpsController,
} from '../../src/PerpsController.js';
import { PERPS_ERROR_CODES } from '../../src/perpsErrorCodes.js';
import type { HyperLiquidWalletParams } from '../../src/services/HyperLiquidClientService.js';
import { TradingReadinessCache } from '../../src/services/TradingReadinessCache.js';
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
  MAIN_SIGNATURE,
  OTHER_AGENT_ADDRESS,
  OTHER_AGENT_SIGNATURE,
  USER_SIGNED_PAYLOAD,
} from '../helpers/agentFixtures.js';
import { createMockInfoClient } from '../helpers/providerMocks.js';
import {
  createMockEvmAccount,
  createMockInfrastructure,
  createMockMessenger,
} from '../helpers/serviceMocks.js';

const MAIN_ADDRESS = createMockEvmAccount().address;
// The controller starts on mainnet (default state).
const MAINNET_ACCOUNT: PerpsAgentAccount = {
  mainAddress: MAIN_ADDRESS,
  isTestnet: false,
};
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
    let signature: string;
    try {
      signature = await this.#wallet.signTypedData(payload);
    } catch (error) {
      // Like the SDK, which keeps the wallet error as the cause.
      throw new Error('Failed to sign the typed data using the wallet', {
        cause: error,
      });
    }
    const signer = SIGNERS.get(signature);
    mockVenue.writes.push({ write, params, signer });
    if (signer && mockVenue.revokedAgents.has(signer)) {
      throw new Error(`User or API Wallet ${signer} does not exist.`);
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
      referral: jest.fn().mockResolvedValue({
        referredBy: { code: REFERRAL_CONFIG.MainnetCode },
        referrerState: {
          stage: 'ready',
          data: { code: REFERRAL_CONFIG.MainnetCode },
        },
      }),
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
   * A messenger that answers the host actions these flows call: an empty
   * remote feature flag state, so the controller reads its defaults, the
   * selected account, and the network the fee discount looks up.
   *
   * @returns The messenger.
   */
  function createMessenger(): ReturnType<typeof createMockMessenger> {
    const answers: Record<string, unknown> = {
      'RemoteFeatureFlagController:getState': {
        remoteFeatureFlags: {},
        cacheTimestamp: 0,
      },
      'AccountTreeController:getAccountsFromSelectedAccountGroup': [
        createMockEvmAccount(),
      ],
      'NetworkController:getState': { selectedNetworkClientId: 'mainnet' },
      'NetworkController:getNetworkClientById': {
        configuration: { chainId: '0x1' },
      },
    };
    return createMockMessenger({
      call: jest
        .fn()
        .mockImplementation((action: string): unknown => answers[action]),
    });
  }

  /**
   * Build a controller whose host signs with `accountSigner` and resolves
   * agents with `getAgentSigner`.
   *
   * @param signer - The host's account signer.
   * @param hyperliquid - The host's HyperLiquid credentials.
   * @returns The controller.
   */
  function createController(
    signer: PerpsAccountSigner = accountSigner,
    hyperliquid: HyperLiquidCredentials = { getAgentSigner, onAgentRejected },
  ): PerpsController {
    return new PerpsController({
      messenger: createMessenger(),
      state: getDefaultPerpsControllerState(),
      clientConfig: { providerCredentials: { hyperliquid } },
      infrastructure: { ...infrastructure, accountSigner: signer },
      deferEligibilityCheck: true,
    });
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
    const controller = createController();
    await controller.init();

    const placed = await placeOrder(controller);

    expect(placed).toStrictEqual(PLACED_ORDER);
    expect(signedWrites()).toStrictEqual([
      ['approveBuilderFee', MAIN_ADDRESS],
      ['order', AGENT_ADDRESS],
    ]);
    expect(getAgentSigner.mock.calls).toStrictEqual([[MAINNET_ACCOUNT]]);
    expect(agentSigner.signTypedData.mock.calls).toStrictEqual([[L1_PAYLOAD]]);
    expect(accountSigner.signTypedData.mock.calls).toStrictEqual([
      [MAIN_ADDRESS, APPROVE_BUILDER_FEE_PAYLOAD],
    ]);
    expect(onAgentRejected).not.toHaveBeenCalled();
    expect(loggerError).not.toHaveBeenCalled();
  });

  it('signs L1 actions with the main account when the host has no getAgentSigner', async () => {
    const controller = createController(accountSigner, {});
    await controller.init();

    const placed = await placeOrder(controller);

    expect(placed).toStrictEqual(PLACED_ORDER);
    expect(signedWrites()).toStrictEqual([['order', MAIN_ADDRESS]]);
    expect(accountSigner.signTypedData.mock.calls).toStrictEqual([
      [MAIN_ADDRESS, L1_PAYLOAD],
    ]);
    expect(loggerError).not.toHaveBeenCalled();
  });

  it('pins L1 actions to the main account with setAgentSigner(null) until clearAgentSigners', async () => {
    const controller = createController();
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
    expect(getAgentSigner.mock.calls).toStrictEqual([[MAINNET_ACCOUNT]]);
    expect(onAgentRejected).not.toHaveBeenCalled();
    expect(loggerError).not.toHaveBeenCalled();
  });

  it('keeps a setAgentSigner binding when the HyperLiquid provider is re-created', async () => {
    getAgentSigner.mockResolvedValue(null);
    const boundAgent = createAgent(OTHER_AGENT_ADDRESS, OTHER_AGENT_SIGNATURE);
    const controller = createController();
    await controller.init();
    controller.setAgentSigner(MAINNET_ACCOUNT, boundAgent);

    const placedBefore = await placeOrder(controller);
    await controller.toggleTestnet();
    await controller.toggleTestnet();
    const placedAfter = await placeOrder(controller);

    expect([placedBefore, placedAfter]).toStrictEqual([
      PLACED_ORDER,
      PLACED_ORDER,
    ]);
    // The original and the re-created mainnet provider each built SDK
    // clients.
    expect(mockVenue.networks).toStrictEqual(['mainnet', 'mainnet']);
    expect(signedWrites()).toStrictEqual([
      ['order', OTHER_AGENT_ADDRESS],
      ['order', OTHER_AGENT_ADDRESS],
    ]);
    expect(getAgentSigner).not.toHaveBeenCalled();
    expect(accountSigner.signTypedData).not.toHaveBeenCalled();
    expect(onAgentRejected).not.toHaveBeenCalled();
    expect(loggerError).not.toHaveBeenCalled();
  });

  it('honors a setAgentSigner binding made before init', async () => {
    getAgentSigner.mockResolvedValue(null);
    const boundAgent = createAgent(OTHER_AGENT_ADDRESS, OTHER_AGENT_SIGNATURE);
    const controller = createController();

    controller.setAgentSigner(MAINNET_ACCOUNT, boundAgent);
    await controller.init();
    const placed = await placeOrder(controller);

    expect(placed).toStrictEqual(PLACED_ORDER);
    expect(signedWrites()).toStrictEqual([['order', OTHER_AGENT_ADDRESS]]);
    expect(getAgentSigner).not.toHaveBeenCalled();
    expect(onAgentRejected).not.toHaveBeenCalled();
    expect(loggerError).not.toHaveBeenCalled();
  });

  it('forgets a setAgentSigner binding cleared before init', async () => {
    const boundAgent = createAgent(OTHER_AGENT_ADDRESS, OTHER_AGENT_SIGNATURE);
    const controller = createController();
    controller.setAgentSigner(MAINNET_ACCOUNT, boundAgent);

    controller.clearAgentSigners();
    await controller.init();
    const placed = await placeOrder(controller);

    expect(placed).toStrictEqual(PLACED_ORDER);
    expect(signedWrites()).toStrictEqual([['order', AGENT_ADDRESS]]);
    expect(getAgentSigner.mock.calls).toStrictEqual([[MAINNET_ACCOUNT]]);
    expect(boundAgent.signTypedData).not.toHaveBeenCalled();
    expect(loggerError).not.toHaveBeenCalled();
  });

  it('signs with the agent bound through setAgentSigner after another was resolved', async () => {
    const reboundAgent = createAgent(
      OTHER_AGENT_ADDRESS,
      OTHER_AGENT_SIGNATURE,
    );
    const controller = createController();
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
    expect(getAgentSigner.mock.calls).toStrictEqual([[MAINNET_ACCOUNT]]);
    expect(onAgentRejected).not.toHaveBeenCalled();
    expect(loggerError).not.toHaveBeenCalled();
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
    const controller = createController();
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
    expect(onAgentRejected.mock.calls).toStrictEqual([
      [MAINNET_ACCOUNT, AGENT_ADDRESS],
    ]);
    expect(placed).toStrictEqual(PLACED_ORDER);
    expect(signedWrites()).toStrictEqual([
      ['cancel', AGENT_ADDRESS],
      ['order', OTHER_AGENT_ADDRESS],
    ]);
    expect(getAgentSigner.mock.calls).toStrictEqual([
      [MAINNET_ACCOUNT],
      [MAINNET_ACCOUNT],
    ]);
    // Nothing reports the retryable signer failure.
    expect(loggerError).not.toHaveBeenCalled();
  });

  it('releases a setAgentSigner binding to an agent the venue rejects', async () => {
    const boundAgent = createAgent(OTHER_AGENT_ADDRESS, OTHER_AGENT_SIGNATURE);
    mockVenue.revokedAgents.add(OTHER_AGENT_ADDRESS);
    const controller = createController();
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
    expect(onAgentRejected.mock.calls).toStrictEqual([
      [MAINNET_ACCOUNT, OTHER_AGENT_ADDRESS],
    ]);
    // The binding is gone, so the host's getAgentSigner answers.
    expect(placed).toStrictEqual(PLACED_ORDER);
    expect(signedWrites()).toStrictEqual([
      ['cancel', OTHER_AGENT_ADDRESS],
      ['order', AGENT_ADDRESS],
    ]);
    expect(getAgentSigner.mock.calls).toStrictEqual([[MAINNET_ACCOUNT]]);
    expect(loggerError).not.toHaveBeenCalled();
  });

  it('prepares nothing and reports KEYRING_LOCKED while the account signer is not ready', async () => {
    const controller = createController({
      ...accountSigner,
      isReady: (): boolean => false,
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
    expect(getAgentSigner).not.toHaveBeenCalled();
    expect(onAgentRejected).not.toHaveBeenCalled();
    expect(loggerError).not.toHaveBeenCalled();
  });

  it('prepares the migration and builder fee on the main account and the referral on the agent', async () => {
    // A legacy account with no referral that has not approved the builder
    // fee yet.
    mockVenue.infoClient = createMockInfoClient({
      userAbstraction: jest.fn().mockResolvedValue('dexAbstraction'),
      maxBuilderFee: jest.fn().mockResolvedValueOnce(0).mockResolvedValue(1),
    });
    const controller = createController();
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
    expect(getAgentSigner.mock.calls).toStrictEqual([[MAINNET_ACCOUNT]]);
    expect(onAgentRejected).not.toHaveBeenCalled();
    expect(loggerError).not.toHaveBeenCalled();
  });
});
