/* eslint-disable */
/**
 * Unit tests for HyperLiquidProvider.setTradingWalletOverride and the
 * getAgentSigner pass-through to the wallet service.
 */

jest.mock('@nktkas/hyperliquid', () => ({}));

import { HyperLiquidProvider } from '../../../src/providers/HyperLiquidProvider.js';
import { HyperLiquidClientService } from '../../../src/services/HyperLiquidClientService.js';
import { HyperLiquidSubscriptionService } from '../../../src/services/HyperLiquidSubscriptionService.js';
import type { AgentSigner } from '../../../src/services/HyperLiquidWalletService.js';
import { HyperLiquidWalletService } from '../../../src/services/HyperLiquidWalletService.js';
import type { PerpsPlatformDependencies } from '../../../src/types/index.js';
import {
  createMockInfrastructure,
  createMockMessenger,
} from '../../helpers/serviceMocks.js';

jest.mock('../../../src/services/HyperLiquidClientService');
jest.mock('../../../src/services/HyperLiquidWalletService');
jest.mock('../../../src/services/HyperLiquidSubscriptionService');

const MockedHyperLiquidClientService =
  HyperLiquidClientService as jest.MockedClass<typeof HyperLiquidClientService>;
const MockedHyperLiquidWalletService =
  HyperLiquidWalletService as jest.MockedClass<typeof HyperLiquidWalletService>;
const MockedHyperLiquidSubscriptionService =
  HyperLiquidSubscriptionService as jest.MockedClass<
    typeof HyperLiquidSubscriptionService
  >;

const AGENT_ADDRESS = '0x2222222222222222222222222222222222222222' as const;
const MASTER_ADDRESS = '0x1234567890123456789012345678901234567890' as const;

const createMockAgentAdapter = () => ({
  address: AGENT_ADDRESS,
  signTypedData: jest.fn().mockResolvedValue('0xagentsig'),
  getChainId: jest.fn().mockResolvedValue(42161),
});

const createMockMasterAdapter = () => ({
  address: MASTER_ADDRESS,
  signTypedData: jest.fn().mockResolvedValue('0xmastersig'),
  getChainId: jest.fn().mockResolvedValue(42161),
});

describe('HyperLiquidProvider trading wallet override', () => {
  const mockPlatformDependencies: PerpsPlatformDependencies =
    createMockInfrastructure();
  const mockMessenger = createMockMessenger();

  let mockClientService: jest.Mocked<HyperLiquidClientService>;
  let mockWalletService: jest.Mocked<HyperLiquidWalletService>;
  let mockSubscriptionService: jest.Mocked<HyperLiquidSubscriptionService>;

  const createTestProvider = (options: { getAgentSigner?: unknown } = {}) =>
    new HyperLiquidProvider({
      platformDependencies: mockPlatformDependencies,
      messenger: mockMessenger,
      ...(options as object),
    });

  beforeEach(() => {
    jest.clearAllMocks();

    mockClientService = {
      initialize: jest.fn().mockResolvedValue(undefined),
      disconnect: jest.fn().mockResolvedValue(undefined),
      isInitialized: jest.fn().mockReturnValue(false),
      isTestnetMode: jest.fn().mockReturnValue(false),
      setTestnetMode: jest.fn(),
      setOnTerminateCallback: jest.fn(),
      setOnReconnectCallback: jest.fn(),
      getConnectionState: jest.fn().mockReturnValue('disconnected'),
      getSubscriptionClient: jest.fn(),
    } as unknown as jest.Mocked<HyperLiquidClientService>;

    mockWalletService = {
      createWalletAdapter: jest.fn(() => createMockMasterAdapter()),
      createAgentWalletAdapter: jest.fn(() => createMockAgentAdapter()),
      setTestnetMode: jest.fn(),
    } as unknown as jest.Mocked<HyperLiquidWalletService>;

    mockSubscriptionService = {} as jest.Mocked<HyperLiquidSubscriptionService>;

    MockedHyperLiquidClientService.mockImplementation(() => mockClientService);
    MockedHyperLiquidWalletService.mockImplementation(() => mockWalletService);
    MockedHyperLiquidSubscriptionService.mockImplementation(
      () => mockSubscriptionService,
    );
  });

  it('passes getAgentSigner through to the wallet service constructor', () => {
    const getAgentSigner = jest.fn();
    createTestProvider({ getAgentSigner });

    const constructorArgs = MockedHyperLiquidWalletService.mock.calls[0];
    const options = constructorArgs?.[2] as { getAgentSigner?: unknown };
    expect(options.getAgentSigner).toBe(getAgentSigner);
  });

  it('reinitializes the client service with the agent adapter', async () => {
    const agentSigner: AgentSigner = {
      address: AGENT_ADDRESS,
      signTypedData: jest.fn().mockResolvedValue('0xagentsig'),
    };
    const provider = createTestProvider();
    mockWalletService.createAgentWalletAdapter = jest.fn(() =>
      createMockAgentAdapter(),
    );

    await provider.setTradingWalletOverride(agentSigner);

    expect(mockClientService.disconnect).toHaveBeenCalledTimes(1);
    expect(mockWalletService.createAgentWalletAdapter).toHaveBeenCalledWith(
      agentSigner,
    );
    expect(mockClientService.initialize).toHaveBeenCalledTimes(1);
    const wallet = mockClientService.initialize.mock.calls[0]?.[0];
    expect(wallet?.address).toBe(AGENT_ADDRESS);
  });

  it('reinitializes the client service with the master adapter when the override is cleared', async () => {
    const provider = createTestProvider();

    await provider.setTradingWalletOverride(null);

    expect(mockClientService.disconnect).toHaveBeenCalledTimes(1);
    expect(mockWalletService.createWalletAdapter).toHaveBeenCalledTimes(1);
    expect(mockClientService.initialize).toHaveBeenCalledTimes(1);
    const wallet = mockClientService.initialize.mock.calls[0]?.[0];
    expect(wallet?.address).toBe(MASTER_ADDRESS);
  });

  it('keeps the override for rebuilds after a network toggle', async () => {
    const agentSigner: AgentSigner = {
      address: AGENT_ADDRESS,
      signTypedData: jest.fn().mockResolvedValue('0xagentsig'),
    };
    const provider = createTestProvider();

    await provider.setTradingWalletOverride(agentSigner);

    // toggleTestnet resets the initialized flag so the next action rebuilds.
    mockClientService.initialize.mockClear();
    await provider.toggleTestnet();
    await provider.initialize();

    expect(mockClientService.initialize).toHaveBeenCalledTimes(1);
    const wallet = mockClientService.initialize.mock.calls[0]?.[0];
    expect(wallet?.address).toBe(AGENT_ADDRESS);
  });

  it('applies concurrent overrides sequentially', async () => {
    const firstSigner: AgentSigner = {
      address: AGENT_ADDRESS,
      signTypedData: jest.fn().mockResolvedValue('0xfirst'),
    };
    const provider = createTestProvider();

    await Promise.all([
      provider.setTradingWalletOverride(firstSigner),
      provider.setTradingWalletOverride(null),
    ]);

    expect(mockClientService.disconnect).toHaveBeenCalledTimes(2);
    expect(mockClientService.initialize).toHaveBeenCalledTimes(2);
    const lastWallet =
      mockClientService.initialize.mock.calls[
        mockClientService.initialize.mock.calls.length - 1
      ]?.[0];
    expect(lastWallet?.address).toBe(MASTER_ADDRESS);
  });
});
