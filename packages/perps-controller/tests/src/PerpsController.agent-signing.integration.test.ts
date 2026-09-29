import type { Hex } from '@metamask/utils';

import {
  getDefaultPerpsControllerState,
  PerpsController,
} from '../../src/PerpsController.js';
import { HyperLiquidClientService } from '../../src/services/HyperLiquidClientService.js';
import type { HyperLiquidWalletParams } from '../../src/services/HyperLiquidClientService.js';
import type {
  PerpsAgentAccount,
  PerpsAgentSigner,
  PerpsTypedDataPayload,
} from '../../src/types/index.js';
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
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000' as const;
// The controller starts on mainnet (default state).
const MAINNET_ACCOUNT: PerpsAgentAccount = {
  mainAddress: MAIN_ADDRESS,
  isTestnet: false,
};

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
    user: MAIN_ADDRESS,
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

  beforeEach(() => {
    clientServices = [];
    MockedClientService.mockImplementation((_deps, options) => {
      const isTestnet = options?.isTestnet ?? false;
      const clientService = {
        initialize: jest
          .fn<Promise<void>, [HyperLiquidWalletParams]>()
          .mockResolvedValue(undefined),
        isInitialized: jest.fn().mockReturnValue(true),
        isTestnetMode: (): boolean => isTestnet,
        ensureInitialized: jest.fn(),
        getInfoClient: jest.fn().mockReturnValue({
          twapHistory: jest.fn().mockResolvedValue([]),
          userTwapSliceFills: jest.fn().mockResolvedValue([]),
        }),
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
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  /**
   * Build a controller whose host signs with `accountSigner` and resolves
   * agents with `getAgentSigner`.
   *
   * @returns The controller.
   */
  function createController(): PerpsController {
    return new PerpsController({
      messenger: createMockMessenger(),
      state: getDefaultPerpsControllerState(),
      clientConfig: {
        providerCredentials: { hyperliquid: { getAgentSigner } },
      },
      infrastructure: { ...createMockInfrastructure(), accountSigner },
      deferEligibilityCheck: true,
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
});
