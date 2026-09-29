import type { Hex } from '@metamask/utils';

import {
  getDefaultPerpsControllerState,
  PerpsController,
} from '../../src/PerpsController.js';
import { PERPS_ERROR_CODES } from '../../src/perpsErrorCodes.js';
import { HyperLiquidClientService } from '../../src/services/HyperLiquidClientService.js';
import type { HyperLiquidWalletParams } from '../../src/services/HyperLiquidClientService.js';
import { TradingReadinessCache } from '../../src/services/TradingReadinessCache.js';
import type {
  PerpsAgentAccount,
  PerpsAgentSigner,
} from '../../src/types/index.js';
import { L1_PAYLOAD, USER_SIGNED_PAYLOAD } from '../helpers/agentFixtures.js';
import {
  createMockExchangeClient,
  createMockInfoClient,
} from '../helpers/providerMocks.js';
import {
  createMockEvmAccount,
  createMockInfrastructure,
  createMockMessenger,
} from '../helpers/serviceMocks.js';

// The controller builds a real HyperLiquidProvider and wallet service; only
// the SDK and its client service are mocked.
jest.mock('@nktkas/hyperliquid', () => ({}));
jest.mock('../../src/services/HyperLiquidClientService', () => ({
  HyperLiquidClientService: jest.fn(),
  WebSocketConnectionState: jest.requireActual<
    typeof import('../../src/types/index.js')
  >('../../src/types/index').WebSocketConnectionState,
}));

const MockedClientService = HyperLiquidClientService as jest.MockedClass<
  typeof HyperLiquidClientService
>;

const MAIN_ADDRESS = createMockEvmAccount().address;
const MAIN_SIGNATURE = `0x${'ab'.repeat(65)}` as const;
const AGENT_SIGNATURE = `0x${'cd'.repeat(65)}` as const;
// The controller starts on mainnet (default state).
const MAINNET_ACCOUNT: PerpsAgentAccount = {
  mainAddress: MAIN_ADDRESS,
  isTestnet: false,
};

type ClientServiceMock = {
  initialize: jest.Mock<Promise<void>, [HyperLiquidWalletParams]>;
  isTestnetMode: () => boolean;
};

describe('PerpsController agent signing with a real HyperLiquid provider', () => {
  let clientServices: ClientServiceMock[];
  let accountSigner: {
    signTypedData: jest.Mock;
    signPersonalMessage: jest.Mock;
  };
  let agentSigner: PerpsAgentSigner & { signTypedData: jest.Mock };
  let getAgentSigner: jest.Mock;
  let onAgentRejected: jest.Mock;
  let infrastructure: ReturnType<typeof createMockInfrastructure>;
  let loggerError: jest.SpyInstance;
  let exchangeClient: ReturnType<typeof createMockExchangeClient>;

  beforeEach(() => {
    TradingReadinessCache.clearAll();
    clientServices = [];
    exchangeClient = createMockExchangeClient();
    MockedClientService.mockImplementation((_deps, options) => {
      const isTestnet = options?.isTestnet ?? false;
      const clientService = {
        initialize: jest
          .fn<Promise<void>, [HyperLiquidWalletParams]>()
          .mockResolvedValue(undefined),
        isInitialized: jest.fn().mockReturnValue(true),
        isTestnetMode: (): boolean => isTestnet,
        ensureInitialized: jest.fn(),
        getInfoClient: jest.fn().mockReturnValue(
          createMockInfoClient({
            twapHistory: jest.fn().mockResolvedValue([]),
            userTwapSliceFills: jest.fn().mockResolvedValue([]),
          }),
        ),
        getExchangeClient: jest.fn(() => exchangeClient),
        getSubscriptionClient: jest.fn(),
        setOnTerminateCallback: jest.fn(),
        setOnReconnectCallback: jest.fn(),
        disconnect: jest.fn().mockResolvedValue(undefined),
      };
      clientServices.push(clientService);
      return clientService as unknown as HyperLiquidClientService;
    });
    accountSigner = {
      signTypedData: jest.fn().mockResolvedValue(MAIN_SIGNATURE),
      signPersonalMessage: jest.fn(),
    };
    agentSigner = {
      address: '0x00000000000000000000000000000000000a9e17',
      signTypedData: jest.fn().mockResolvedValue(AGENT_SIGNATURE),
    };
    getAgentSigner = jest.fn().mockResolvedValue(agentSigner);
    onAgentRejected = jest.fn();
    infrastructure = createMockInfrastructure();
    loggerError = jest.spyOn(infrastructure.logger, 'error');
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  /**
   * A messenger whose remote feature flags are empty, so the controller
   * reads its defaults instead of logging a missing flag state.
   *
   * @returns The messenger.
   */
  function createMessenger(): ReturnType<typeof createMockMessenger> {
    const messenger = createMockMessenger();
    const defaultCall = messenger.call.getMockImplementation();
    messenger.call.mockImplementation(
      (action: string, ...args: unknown[]): unknown =>
        action === 'RemoteFeatureFlagController:getState'
          ? { remoteFeatureFlags: {}, cacheTimestamp: 0 }
          : defaultCall?.(action as never, ...(args as never[])),
    );
    return messenger;
  }

  /**
   * The errors the HyperLiquid provider itself reported.
   *
   * @returns The logged errors whose context names the provider.
   */
  function providerErrors(): unknown[] {
    return loggerError.mock.calls.filter(
      ([, options]: [unknown, { context?: { name?: string } } | undefined]) =>
        options?.context?.name === 'HyperLiquidProvider',
    );
  }

  /**
   * Build a controller whose host signs with `accountSigner` and resolves
   * agents with `getAgentSigner`.
   *
   * @returns The controller.
   */
  function createController(): PerpsController {
    return new PerpsController({
      messenger: createMessenger(),
      state: getDefaultPerpsControllerState(),
      clientConfig: {
        providerCredentials: {
          hyperliquid: { getAgentSigner, onAgentRejected },
        },
      },
      infrastructure: { ...infrastructure, accountSigner },
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
   * Make the venue sign each cancel with the SDK wallet, then reject it as
   * an unknown wallet: what HyperLiquid answers for a revoked or expired
   * agent.
   *
   * @param wallet - The SDK wallet the provider signs with.
   * @param rejectedAddress - The address the venue rejects.
   */
  function rejectCancelsAs(
    wallet: HyperLiquidWalletParams,
    rejectedAddress: Hex,
  ): void {
    exchangeClient.cancel.mockImplementation(async () => {
      await wallet.signTypedData(L1_PAYLOAD);
      throw new Error(`User or API Wallet ${rejectedAddress} does not exist.`);
    });
  }

  /**
   * Make the active HyperLiquid provider initialize its SDK clients, and
   * return the wallet adapter it handed to them.
   *
   * @param controller - The initialized controller.
   * @returns The wallet adapter the SDK signs with.
   */
  async function getSdkWallet(
    controller: PerpsController,
  ): Promise<HyperLiquidWalletParams> {
    await controller.getTwapOrders();
    const initialized = clientServices.filter(
      (clientService) => clientService.initialize.mock.calls.length > 0,
    );
    const latest = initialized[initialized.length - 1];
    if (!latest) {
      throw new Error('The provider never initialized its SDK clients');
    }
    const [[wallet]] = latest.initialize.mock.calls;
    return wallet;
  }

  it("signs L1 actions with the host's agent and user-signed actions with the main account", async () => {
    const controller = createController();
    await controller.init();
    const wallet = await getSdkWallet(controller);

    const l1Signature: Hex = await wallet.signTypedData(L1_PAYLOAD);
    const userSignature: Hex = await wallet.signTypedData(USER_SIGNED_PAYLOAD);

    expect(l1Signature).toBe(AGENT_SIGNATURE);
    expect(userSignature).toBe(MAIN_SIGNATURE);
    expect(getAgentSigner.mock.calls).toStrictEqual([[MAINNET_ACCOUNT]]);
    expect(agentSigner.signTypedData.mock.calls).toStrictEqual([[L1_PAYLOAD]]);
    expect(accountSigner.signTypedData.mock.calls).toStrictEqual([
      [MAIN_ADDRESS, USER_SIGNED_PAYLOAD],
    ]);
  });

  it('pins L1 actions to the main account with setAgentSigner(null) until clearAgentSigners', async () => {
    const controller = createController();
    await controller.init();
    const wallet = await getSdkWallet(controller);

    controller.setAgentSigner(MAINNET_ACCOUNT, null);
    const pinnedSignature = await wallet.signTypedData(L1_PAYLOAD);
    controller.clearAgentSigners();
    const clearedSignature = await wallet.signTypedData(L1_PAYLOAD);

    expect(pinnedSignature).toBe(MAIN_SIGNATURE);
    expect(clearedSignature).toBe(AGENT_SIGNATURE);
    expect(accountSigner.signTypedData.mock.calls).toStrictEqual([
      [MAIN_ADDRESS, L1_PAYLOAD],
    ]);
    expect(getAgentSigner).toHaveBeenCalledTimes(1);
  });

  it('keeps a setAgentSigner binding when the HyperLiquid provider is re-created', async () => {
    getAgentSigner.mockResolvedValue(null);
    const boundAgent = {
      address: '0x00000000000000000000000000000000000b0a7d' as const,
      signTypedData: jest.fn().mockResolvedValue(AGENT_SIGNATURE),
    };
    const controller = createController();
    await controller.init();
    controller.setAgentSigner(MAINNET_ACCOUNT, boundAgent);

    await controller.toggleTestnet();
    await controller.toggleTestnet();
    const wallet = await getSdkWallet(controller);
    const signature = await wallet.signTypedData(L1_PAYLOAD);

    // The initial, the testnet and the mainnet provider each own a client.
    expect(
      clientServices.map(({ isTestnetMode }) => isTestnetMode()),
    ).toStrictEqual([false, true, false]);
    expect(signature).toBe(AGENT_SIGNATURE);
    expect(boundAgent.signTypedData.mock.calls).toStrictEqual([[L1_PAYLOAD]]);
    expect(getAgentSigner).not.toHaveBeenCalled();
    expect(accountSigner.signTypedData).not.toHaveBeenCalled();
  });

  it('honors a setAgentSigner binding made before init', async () => {
    getAgentSigner.mockResolvedValue(null);
    const boundAgent = {
      address: '0x00000000000000000000000000000000000b0a7d' as const,
      signTypedData: jest.fn().mockResolvedValue(AGENT_SIGNATURE),
    };
    const controller = createController();

    controller.setAgentSigner(MAINNET_ACCOUNT, boundAgent);
    await controller.init();
    const wallet = await getSdkWallet(controller);
    const signature = await wallet.signTypedData(L1_PAYLOAD);

    expect(signature).toBe(AGENT_SIGNATURE);
    expect(boundAgent.signTypedData.mock.calls).toStrictEqual([[L1_PAYLOAD]]);
    expect(getAgentSigner).not.toHaveBeenCalled();
  });
  it('signs with the agent bound through setAgentSigner after another was resolved', async () => {
    const reboundAgent = createAgent(
      '0x00000000000000000000000000000000000b0a7d',
      `0x${'ef'.repeat(65)}`,
    );
    const controller = createController();
    await controller.init();
    const wallet = await getSdkWallet(controller);

    const resolvedSignature = await wallet.signTypedData(L1_PAYLOAD);
    controller.setAgentSigner(MAINNET_ACCOUNT, reboundAgent);
    const reboundSignature = await wallet.signTypedData(L1_PAYLOAD);
    controller.setAgentSigner(MAINNET_ACCOUNT, null);
    const pinnedSignature = await wallet.signTypedData(L1_PAYLOAD);

    expect([
      resolvedSignature,
      reboundSignature,
      pinnedSignature,
    ]).toStrictEqual([AGENT_SIGNATURE, `0x${'ef'.repeat(65)}`, MAIN_SIGNATURE]);
    expect(agentSigner.signTypedData.mock.calls).toStrictEqual([[L1_PAYLOAD]]);
    expect(reboundAgent.signTypedData.mock.calls).toStrictEqual([[L1_PAYLOAD]]);
    expect(accountSigner.signTypedData.mock.calls).toStrictEqual([
      [MAIN_ADDRESS, L1_PAYLOAD],
    ]);
    expect(getAgentSigner).toHaveBeenCalledTimes(1);
  });

  it('tells the host about an agent the venue rejects and asks for another', async () => {
    const replacementAgent = createAgent(
      '0x00000000000000000000000000000000000b0a7d',
      `0x${'ef'.repeat(65)}`,
    );
    getAgentSigner
      .mockResolvedValueOnce(agentSigner)
      .mockResolvedValueOnce(replacementAgent);
    const controller = createController();
    await controller.init();
    const wallet = await getSdkWallet(controller);
    rejectCancelsAs(wallet, agentSigner.address);

    const result = await controller.cancelOrder({
      orderId: '1',
      symbol: 'BTC',
    });
    const nextSignature = await wallet.signTypedData(L1_PAYLOAD);

    expect(result).toStrictEqual(
      expect.objectContaining({
        success: false,
        error: PERPS_ERROR_CODES.KEYRING_LOCKED,
      }),
    );
    expect(onAgentRejected.mock.calls).toStrictEqual([
      [MAINNET_ACCOUNT, agentSigner.address],
    ]);
    expect(nextSignature).toBe(`0x${'ef'.repeat(65)}`);
    expect(getAgentSigner.mock.calls).toStrictEqual([
      [MAINNET_ACCOUNT],
      [MAINNET_ACCOUNT],
    ]);
    // The provider does not report the retryable signer failure.
    expect(providerErrors()).toStrictEqual([]);
  });

  it('releases a setAgentSigner binding to an agent the venue rejects', async () => {
    const boundAgent = createAgent(
      '0x00000000000000000000000000000000000b0a7d',
      `0x${'ef'.repeat(65)}`,
    );
    const controller = createController();
    await controller.init();
    controller.setAgentSigner(MAINNET_ACCOUNT, boundAgent);
    const wallet = await getSdkWallet(controller);
    rejectCancelsAs(wallet, boundAgent.address);

    const result = await controller.cancelOrder({
      orderId: '1',
      symbol: 'BTC',
    });
    const nextSignature = await wallet.signTypedData(L1_PAYLOAD);

    expect(result).toStrictEqual(
      expect.objectContaining({
        success: false,
        error: PERPS_ERROR_CODES.KEYRING_LOCKED,
      }),
    );
    expect(onAgentRejected.mock.calls).toStrictEqual([
      [MAINNET_ACCOUNT, boundAgent.address],
    ]);
    // The binding is gone, so the host's getAgentSigner answers.
    expect(nextSignature).toBe(AGENT_SIGNATURE);
    expect(getAgentSigner.mock.calls).toStrictEqual([[MAINNET_ACCOUNT]]);
  });

  it('prepares nothing and reports KEYRING_LOCKED while the account signer is not ready', async () => {
    const controller = new PerpsController({
      messenger: createMessenger(),
      state: getDefaultPerpsControllerState(),
      clientConfig: {
        providerCredentials: {
          hyperliquid: { getAgentSigner, onAgentRejected },
        },
      },
      infrastructure: {
        ...infrastructure,
        accountSigner: { ...accountSigner, isReady: (): boolean => false },
      },
      deferEligibilityCheck: true,
    });
    await controller.init();

    const result = await controller.prepareTradingWallet();

    expect(result).toStrictEqual({
      ready: false,
      error: PERPS_ERROR_CODES.KEYRING_LOCKED,
    });
    expect(
      clientServices.flatMap(({ initialize }) => initialize.mock.calls),
    ).toStrictEqual([]);
    expect(
      Object.values(exchangeClient).filter(
        (write) => write.mock.calls.length > 0,
      ),
    ).toStrictEqual([]);
    expect(accountSigner.signTypedData).not.toHaveBeenCalled();
    expect(getAgentSigner).not.toHaveBeenCalled();
    expect(loggerError).not.toHaveBeenCalled();
  });

  it("resolves the provider's readiness once the account is ready to trade", async () => {
    const controller = createController();
    await controller.init();

    const result = await controller.prepareTradingWallet();

    expect(result).toStrictEqual({ ready: true });
    expect(loggerError).not.toHaveBeenCalled();
  });
});
