/* eslint-disable */
/**
 * Unit tests for HyperLiquidWalletService
 */

// Mock keyring-api to avoid import issues with definePattern
jest.mock('@metamask/keyring-api', () => ({
  isEvmAccountType: jest.fn((accountType: string) =>
    accountType?.startsWith('eip155:'),
  ),
}));

// Mock MetaMask utils
jest.mock('@metamask/utils', () => ({
  hasProperty: jest.fn((object: object, property: string) =>
    Object.prototype.hasOwnProperty.call(object, property),
  ),
  parseCaipAccountId: jest.fn((accountId: string) => {
    const parts = accountId.split(':');
    return {
      chainNamespace: parts[0],
      chainReference: parts[1],
      address: parts[2],
    };
  }),
  isValidHexAddress: jest.fn((address: string) =>
    /^0x[0-9a-fA-F]{40}$/.test(address),
  ),
}));

// Mock config
jest.mock('../../../src/constants/hyperLiquidConfig', () => ({
  getChainId: jest.fn((isTestnet: boolean) => (isTestnet ? '421614' : '42161')),
}));

// Mock DevLogger
jest.mock(
  '../../../../core/SDKConnect/utils/DevLogger',
  () => ({
    DevLogger: {
      log: jest.fn(),
    },
  }),
  { virtual: true },
);

import type { CaipAccountId } from '@metamask/utils';

import { HyperLiquidWalletService } from '../../../src/services/HyperLiquidWalletService.js';
import type { AgentSigner } from '../../../src/services/HyperLiquidWalletService.js';
import {
  createMockInfrastructure,
  createMockEvmAccount,
  createMockMessenger,
} from '../../helpers/serviceMocks.js';

const AGENT_ADDRESS = '0x2222222222222222222222222222222222222222' as const;

// The SDK's viem adapters inject this before calling params-style wallets; an
// ethers-style local signer must not receive it.
const EIP712_DOMAIN_TYPES = [
  { name: 'name', type: 'string' },
  { name: 'version', type: 'string' },
  { name: 'chainId', type: 'uint256' },
  { name: 'verifyingContract', type: 'address' },
];

const typedDataParams = {
  domain: {
    name: 'HyperLiquid',
    version: '1',
    chainId: 42161,
    verifyingContract:
      '0x0000000000000000000000000000000000000000' as `0x${string}`,
  },
  types: {
    EIP712Domain: EIP712_DOMAIN_TYPES,
    Agent: [
      { name: 'agentAddress', type: 'address' },
      { name: 'nonce', type: 'uint64' },
    ],
  },
  primaryType: 'Agent',
  message: {
    agentAddress: AGENT_ADDRESS,
    nonce: 0,
  },
};

describe('HyperLiquidWalletService', () => {
  let service: HyperLiquidWalletService;
  let mockDeps: ReturnType<typeof createMockInfrastructure>;
  let mockMessenger: ReturnType<typeof createMockMessenger>;
  const mockEvmAccount = createMockEvmAccount();

  beforeEach(() => {
    jest.clearAllMocks();
    const keyringApi = jest.requireMock('@metamask/keyring-api');
    keyringApi.isEvmAccountType.mockImplementation((accountType: string) =>
      accountType?.startsWith('eip155:'),
    );
    const utils = jest.requireMock('@metamask/utils');
    utils.hasProperty.mockImplementation((object: object, property: string) =>
      Object.prototype.hasOwnProperty.call(object, property),
    );
    utils.parseCaipAccountId.mockImplementation((accountId: string) => {
      const parts = accountId.split(':');
      return {
        chainNamespace: parts[0],
        chainReference: parts[1],
        address: parts[2],
      };
    });
    utils.isValidHexAddress.mockImplementation((address: string) =>
      /^0x[0-9a-fA-F]{40}$/.test(address),
    );
    const hyperLiquidConfig = jest.requireMock(
      '../../../src/constants/hyperLiquidConfig',
    );
    hyperLiquidConfig.getChainId.mockImplementation((isTestnet: boolean) =>
      isTestnet ? '421614' : '42161',
    );
    mockDeps = createMockInfrastructure();
    mockMessenger = createMockMessenger();
    service = new HyperLiquidWalletService(mockDeps, mockMessenger);
  });

  describe('Constructor and Configuration', () => {
    it('should initialize with mainnet by default', () => {
      expect(service.isTestnetMode()).toBe(false);
    });

    it('should initialize with testnet when specified', () => {
      const testnetService = new HyperLiquidWalletService(
        mockDeps,
        mockMessenger,
        { isTestnet: true },
      );

      expect(testnetService.isTestnetMode()).toBe(true);
    });

    it('should update testnet mode', () => {
      service.setTestnetMode(true);

      expect(service.isTestnetMode()).toBe(true);
    });
  });

  describe('Wallet Adapter Creation', () => {
    let walletAdapter: {
      signTypedData: (params: {
        domain: {
          name: string;
          version: string;
          chainId: number;
          verifyingContract: `0x${string}`;
        };
        types: {
          [key: string]: { name: string; type: string }[];
        };
        primaryType: string;
        message: Record<string, unknown>;
      }) => Promise<`0x${string}`>;
      getChainId?: () => Promise<number>;
    };

    beforeEach(() => {
      walletAdapter = service.createWalletAdapter();
    });

    it('should create wallet adapter with signTypedData method', () => {
      expect(walletAdapter).toHaveProperty('signTypedData');
      expect(typeof walletAdapter.signTypedData).toBe('function');
    });

    it('should have getChainId method', () => {
      expect(walletAdapter).toHaveProperty('getChainId');
      expect(typeof walletAdapter.getChainId).toBe('function');
    });

    describe('getChainId method', () => {
      it('should return mainnet chain ID', async () => {
        expect(walletAdapter.getChainId).toBeDefined();
        const chainId = await walletAdapter.getChainId?.();

        expect(chainId).toBe(42161);
      });

      it('should return testnet chain ID when in testnet mode', async () => {
        const testnetService = new HyperLiquidWalletService(
          mockDeps,
          mockMessenger,
          { isTestnet: true },
        );
        const testnetAdapter = testnetService.createWalletAdapter();

        expect(testnetAdapter.getChainId).toBeDefined();
        const chainId = await testnetAdapter.getChainId?.();

        expect(chainId).toBe(421614);
      });
    });

    describe('signTypedData method', () => {
      const mockTypedDataParams = {
        domain: {
          name: 'HyperLiquid',
          version: '1',
          chainId: 42161,
          verifyingContract:
            '0x0000000000000000000000000000000000000000' as `0x${string}`,
        },
        types: {
          Order: [
            { name: 'asset', type: 'uint32' },
            { name: 'isBuy', type: 'bool' },
            { name: 'limitPx', type: 'uint64' },
            { name: 'sz', type: 'uint64' },
            { name: 'reduceOnly', type: 'bool' },
            { name: 'timestamp', type: 'uint64' },
          ],
        },
        primaryType: 'Order',
        message: {
          asset: 0,
          isBuy: true,
          limitPx: '30000',
          sz: '1',
          reduceOnly: false,
          timestamp: Date.now(),
        },
      };

      it('should sign typed data successfully', async () => {
        const result = await walletAdapter.signTypedData(mockTypedDataParams);

        expect(result).toBe('0xSignatureResult');
        expect(mockDeps.debugLogger.log).toHaveBeenCalledWith(
          'HyperLiquidWalletService: Signing typed data (master fallback)',
          {
            address: mockEvmAccount.address,
            primaryType: 'Order',
            domain: mockTypedDataParams.domain,
          },
        );
        expect(mockMessenger.call).toHaveBeenCalledWith(
          'KeyringController:signTypedMessage',
          {
            from: mockEvmAccount.address,
            data: {
              domain: mockTypedDataParams.domain,
              types: mockTypedDataParams.types,
              primaryType: mockTypedDataParams.primaryType,
              message: mockTypedDataParams.message,
            },
          },
          'V4',
        );
      });

      it('should throw error when no account selected', async () => {
        // Mock accountTree to return empty array (no account selected)
        (mockMessenger.call as jest.Mock).mockImplementation(
          (action: string) => {
            if (
              action ===
              'AccountTreeController:getAccountsFromSelectedAccountGroup'
            ) {
              return [];
            }
            if (action === 'KeyringController:getState') {
              return { isUnlocked: true };
            }
            if (action === 'KeyringController:signTypedMessage') {
              return Promise.resolve('0xSignatureResult');
            }
            return undefined;
          },
        );

        // Creating wallet adapter should throw when no account
        expect(() => service.createWalletAdapter()).toThrow(
          'NO_ACCOUNT_SELECTED',
        );
      });

      it('should handle keyring controller errors', async () => {
        (mockMessenger.call as jest.Mock).mockImplementation(
          (action: string) => {
            if (
              action ===
              'AccountTreeController:getAccountsFromSelectedAccountGroup'
            ) {
              return [mockEvmAccount];
            }
            if (action === 'KeyringController:getState') {
              return { isUnlocked: true };
            }
            if (action === 'KeyringController:signTypedMessage') {
              return Promise.reject(new Error('Signing failed'));
            }
            return undefined;
          },
        );

        // Need to recreate the adapter after changing the mock
        const freshAdapter = service.createWalletAdapter();

        await expect(
          freshAdapter.signTypedData(mockTypedDataParams),
        ).rejects.toThrow('Signing failed');
      });

      it('routes Exchange-domain Agent actions through the keyring in master mode', async () => {
        const signature = await walletAdapter.signTypedData({
          ...typedDataParams,
          domain: {
            name: 'Exchange',
            version: '1',
            chainId: 1337,
            verifyingContract:
              '0x0000000000000000000000000000000000000000' as `0x${string}`,
          },
          message: { source: 'a', connectionId: '0xabc123' },
          types: {
            ...typedDataParams.types,
            Agent: [
              { name: 'source', type: 'string' },
              { name: 'connectionId', type: 'bytes32' },
            ],
          },
        });

        expect(signature).toBe('0xSignatureResult');
        expect(mockMessenger.call).toHaveBeenCalledWith(
          'KeyringController:signTypedMessage',
          expect.anything(),
          'V4',
        );
      });
    });
  });

  describe('agent signer seam', () => {
    const createAgentAdapter = (signTypedData: jest.Mock = jest.fn()) => {
      const agentSigner: AgentSigner = {
        address: AGENT_ADDRESS,
        signTypedData,
      };
      const agentService = new HyperLiquidWalletService(
        mockDeps,
        mockMessenger,
      );
      return {
        service: agentService,
        agentSigner,
        adapter: agentService.createAgentWalletAdapter(agentSigner),
      };
    };

    describe('agent mode', () => {
      it('returns an adapter whose address is the agent address', () => {
        const { adapter } = createAgentAdapter();

        expect(adapter.address).toBe(AGENT_ADDRESS);
      });

      it('delegates signing directly to the injected signer with no keyring call', async () => {
        const signTypedData = jest.fn().mockResolvedValue('0xagentsig');
        const { adapter } = createAgentAdapter(signTypedData);

        const signature = await adapter.signTypedData(typedDataParams);

        expect(signature).toBe('0xagentsig');
        expect(signTypedData).toHaveBeenCalledTimes(1);
        expect(mockMessenger.call).not.toHaveBeenCalledWith(
          'KeyringController:signTypedMessage',
          expect.anything(),
          expect.anything(),
        );
      });

      it('strips the injected EIP712Domain type before delegating', async () => {
        const signTypedData = jest.fn().mockResolvedValue('0xagentsig');
        const { adapter } = createAgentAdapter(signTypedData);

        await adapter.signTypedData(typedDataParams);

        const [domain, types, value] = signTypedData.mock.calls[0];
        expect(domain).toBe(typedDataParams.domain);
        expect(types).toEqual({ Agent: typedDataParams.types.Agent });
        expect(value).toEqual(typedDataParams.message);
      });

      it('signs with the agent adapter even when the keyring reports locked', async () => {
        const signTypedData = jest.fn().mockResolvedValue('0xagentsig');
        const { adapter } = createAgentAdapter(signTypedData);
        (mockMessenger.call as jest.Mock).mockImplementation(
          (action: string) => {
            if (
              action ===
              'AccountTreeController:getAccountsFromSelectedAccountGroup'
            ) {
              return [mockEvmAccount];
            }
            if (action === 'KeyringController:getState') {
              return { isUnlocked: false };
            }
            return undefined;
          },
        );

        const signature = await adapter.signTypedData(typedDataParams);

        expect(signature).toBe('0xagentsig');
      });
    });

    describe('agent mode: user-signed action routing', () => {
      // L1 action shape produced by the SDK's `signL1Action`: domain
      // { name: "Exchange", ... } with primaryType "Agent". These are the only
      // signatures the agent key may produce.
      const l1ActionParams = {
        domain: {
          name: 'Exchange',
          version: '1',
          chainId: 1337,
          verifyingContract:
            '0x0000000000000000000000000000000000000000' as `0x${string}`,
        },
        types: {
          EIP712Domain: EIP712_DOMAIN_TYPES,
          Agent: [
            { name: 'source', type: 'string' },
            { name: 'connectionId', type: 'bytes32' },
          ],
        },
        primaryType: 'Agent',
        message: { source: 'a', connectionId: '0xabc123' },
      };

      // User-signed action shape produced by the SDK's `signUserSignedAction`
      // (e.g. `approveBuilderFee`): domain { name:
      // "HyperliquidSignTransaction", ... }. These are master-account
      // authorizations and must fall through to the master keyring path.
      const userSignedParams = {
        domain: {
          name: 'HyperliquidSignTransaction',
          version: '1',
          chainId: 42161,
          verifyingContract:
            '0x0000000000000000000000000000000000000000' as `0x${string}`,
        },
        types: {
          EIP712Domain: EIP712_DOMAIN_TYPES,
          'HyperliquidTransaction:ApproveBuilderFee': [
            { name: 'hyperliquidChain', type: 'string' },
            { name: 'maxFeeRate', type: 'string' },
            { name: 'builder', type: 'address' },
            { name: 'nonce', type: 'uint64' },
          ],
        },
        primaryType: 'HyperliquidTransaction:ApproveBuilderFee',
        message: {
          hyperliquidChain: 'Mainnet',
          maxFeeRate: '0.01%',
          builder: '0x3333333333333333333333333333333333333333',
          nonce: 1700000000000,
        },
      };

      it('signs Exchange-domain Agent actions with the agent signer and zero keyring calls', async () => {
        const signTypedData = jest.fn().mockResolvedValue('0xagentsig');
        const { adapter } = createAgentAdapter(signTypedData);

        const signature = await adapter.signTypedData(l1ActionParams);

        expect(signature).toBe('0xagentsig');
        expect(signTypedData).toHaveBeenCalledTimes(1);
        expect(mockMessenger.call).not.toHaveBeenCalledWith(
          'KeyringController:signTypedMessage',
          expect.anything(),
          expect.anything(),
        );
      });

      it('routes HyperliquidSignTransaction domain actions to the master keyring path', async () => {
        const signTypedData = jest.fn().mockResolvedValue('0xagentsig');
        const { adapter } = createAgentAdapter(signTypedData);

        const signature = await adapter.signTypedData(userSignedParams);

        expect(signature).toBe('0xSignatureResult');
        expect(signTypedData).not.toHaveBeenCalled();
        expect(mockMessenger.call).toHaveBeenCalledWith(
          'KeyringController:signTypedMessage',
          {
            from: mockEvmAccount.address,
            data: {
              domain: userSignedParams.domain,
              types: userSignedParams.types,
              primaryType: userSignedParams.primaryType,
              message: userSignedParams.message,
            },
          },
          'V4',
        );
      });

      it('signs unknown Exchange-domain shapes with the agent signer', async () => {
        const signTypedData = jest.fn().mockResolvedValue('0xagentsig');
        const { adapter } = createAgentAdapter(signTypedData);

        await adapter.signTypedData({
          ...l1ActionParams,
          primaryType: 'UsdClassTransfer',
          message: { source: 'a' },
        });

        expect(signTypedData).toHaveBeenCalledTimes(1);
        expect(mockMessenger.call).not.toHaveBeenCalledWith(
          'KeyringController:signTypedMessage',
          expect.anything(),
          expect.anything(),
        );
      });

      it('keeps the agent address on the adapter for user-signed actions', () => {
        const { adapter } = createAgentAdapter(
          jest.fn().mockResolvedValue('0xagentsig'),
        );

        expect(adapter.address).toBe(AGENT_ADDRESS);
      });
    });
  });

  describe('Account Management', () => {
    it('should get current account ID for mainnet', async () => {
      const accountId = await service.getCurrentAccountId();

      expect(accountId).toBe(`eip155:42161:${mockEvmAccount.address}`);
    });

    it('should get current account ID for testnet', async () => {
      service.setTestnetMode(true);

      const accountId = await service.getCurrentAccountId();

      expect(accountId).toBe(`eip155:421614:${mockEvmAccount.address}`);
    });

    it('should throw error when getting account ID with no selected account', async () => {
      (mockMessenger.call as jest.Mock).mockImplementation((action: string) => {
        if (
          action === 'AccountTreeController:getAccountsFromSelectedAccountGroup'
        ) {
          return [];
        }
        return undefined;
      });

      await expect(service.getCurrentAccountId()).rejects.toThrow(
        'NO_ACCOUNT_SELECTED',
      );
    });

    it('should parse user address from account ID', () => {
      const accountId =
        'eip155:42161:0x1234567890123456789012345678901234567890' as CaipAccountId;

      const address = service.getUserAddress(accountId);

      expect(address).toBe('0x1234567890123456789012345678901234567890');
    });

    it('should throw error for invalid address format', () => {
      const { isValidHexAddress } = jest.requireMock('@metamask/utils');
      isValidHexAddress.mockReturnValueOnce(false);

      const accountId = 'eip155:42161:invalid-address' as CaipAccountId;

      expect(() => service.getUserAddress(accountId)).toThrow(
        'INVALID_ADDRESS_FORMAT',
      );
    });

    it('should get user address with provided account ID', async () => {
      const accountId =
        'eip155:42161:0x9999999999999999999999999999999999999999' as CaipAccountId;

      const address = await service.getUserAddressWithDefault(accountId);

      expect(address).toBe('0x9999999999999999999999999999999999999999');
    });

    it('should get user address with default fallback', async () => {
      const address = await service.getUserAddressWithDefault();

      expect(address).toBe(mockEvmAccount.address);
    });

    it('returns false for software wallet', () => {
      expect(service.isSelectedHardwareWallet()).toBe(false);
    });

    it.each([
      'Ledger Hardware',
      'Trezor Hardware',
      'OneKey Hardware',
      'Lattice Hardware',
      'QR Hardware Wallet Device',
    ])('returns true for %s wallet', (keyringType) => {
      (mockMessenger.call as jest.Mock).mockImplementation((action: string) => {
        if (
          action === 'AccountTreeController:getAccountsFromSelectedAccountGroup'
        ) {
          return [
            {
              ...mockEvmAccount,
              metadata: {
                ...mockEvmAccount.metadata,
                keyring: { type: keyringType },
              },
            },
          ];
        }
        return undefined;
      });

      expect(service.isSelectedHardwareWallet()).toBe(true);
    });
  });

  describe('Network Management', () => {
    it('should update testnet mode correctly', () => {
      expect(service.isTestnetMode()).toBe(false);

      service.setTestnetMode(true);
      expect(service.isTestnetMode()).toBe(true);

      service.setTestnetMode(false);
      expect(service.isTestnetMode()).toBe(false);
    });

    it('should affect chain ID in account ID generation', async () => {
      // Test mainnet
      service.setTestnetMode(false);
      const mainnetAccountId = await service.getCurrentAccountId();
      expect(mainnetAccountId).toContain('eip155:42161:');

      // Test testnet
      service.setTestnetMode(true);
      const testnetAccountId = await service.getCurrentAccountId();
      expect(testnetAccountId).toContain('eip155:421614:');
    });
  });

  describe('Error Handling', () => {
    it('should handle accountTree errors gracefully', async () => {
      (mockMessenger.call as jest.Mock).mockImplementation((action: string) => {
        if (
          action === 'AccountTreeController:getAccountsFromSelectedAccountGroup'
        ) {
          throw new Error('Store error');
        }
        return undefined;
      });

      await expect(service.getCurrentAccountId()).rejects.toThrow(
        'NO_ACCOUNT_SELECTED',
      );
    });

    it('should handle malformed CAIP account IDs', () => {
      const { parseCaipAccountId } = jest.requireMock('@metamask/utils');
      parseCaipAccountId.mockImplementationOnce(() => {
        throw new Error('Invalid CAIP account ID');
      });

      const accountId = 'invalid-caip-id' as CaipAccountId;

      expect(() => service.getUserAddress(accountId)).toThrow(
        'Invalid CAIP account ID',
      );
    });

    it('should throw KEYRING_LOCKED when keyring is locked', async () => {
      const walletAdapter = service.createWalletAdapter();
      (mockMessenger.call as jest.Mock).mockImplementation((action: string) => {
        if (
          action === 'AccountTreeController:getAccountsFromSelectedAccountGroup'
        ) {
          return [mockEvmAccount];
        }
        if (action === 'KeyringController:getState') {
          return { isUnlocked: false };
        }
        return undefined;
      });

      const mockTypedData = {
        domain: {
          name: 'Test',
          version: '1',
          chainId: 42161,
          verifyingContract:
            '0x0000000000000000000000000000000000000000' as `0x${string}`,
        },
        types: {
          Test: [{ name: 'value', type: 'string' }],
        },
        primaryType: 'Test',
        message: { value: 'test' },
      };

      await expect(walletAdapter.signTypedData(mockTypedData)).rejects.toThrow(
        'KEYRING_LOCKED',
      );
      expect(mockMessenger.call).not.toHaveBeenCalledWith(
        'KeyringController:signTypedMessage',
        expect.anything(),
        expect.anything(),
      );
    });

    it('should return keyring unlocked status via isKeyringUnlocked()', () => {
      expect(service.isKeyringUnlocked()).toBe(true);

      (mockMessenger.call as jest.Mock).mockImplementation((action: string) => {
        if (action === 'KeyringController:getState') {
          return { isUnlocked: false };
        }
        return undefined;
      });

      expect(service.isKeyringUnlocked()).toBe(false);
    });

    it('should handle keyring controller initialization errors', async () => {
      const walletAdapter = service.createWalletAdapter();
      (mockMessenger.call as jest.Mock).mockImplementation((action: string) => {
        if (
          action === 'AccountTreeController:getAccountsFromSelectedAccountGroup'
        ) {
          return [mockEvmAccount];
        }
        if (action === 'KeyringController:getState') {
          return { isUnlocked: true };
        }
        if (action === 'KeyringController:signTypedMessage') {
          return Promise.reject(new Error('Keyring not initialized'));
        }
        return undefined;
      });

      const mockTypedData = {
        domain: {
          name: 'Test',
          version: '1',
          chainId: 42161,
          verifyingContract:
            '0x0000000000000000000000000000000000000000' as `0x${string}`,
        },
        types: {
          Test: [{ name: 'value', type: 'string' }],
        },
        primaryType: 'Test',
        message: { value: 'test' },
      };

      await expect(walletAdapter.signTypedData(mockTypedData)).rejects.toThrow(
        'Keyring not initialized',
      );
    });
  });

  describe('Integration Scenarios', () => {
    it('should handle full wallet adapter workflow', async () => {
      const walletAdapter = service.createWalletAdapter();

      // Get chain ID
      expect(walletAdapter.getChainId).toBeDefined();
      const chainId = await (
        walletAdapter.getChainId as () => Promise<number>
      )();
      expect(chainId).toBe(42161);

      // Sign typed data
      const mockTypedData = {
        domain: {
          name: 'Test',
          version: '1',
          chainId,
          verifyingContract:
            '0x0000000000000000000000000000000000000000' as `0x${string}`,
        },
        types: {
          Test: [{ name: 'value', type: 'string' }],
        },
        primaryType: 'Test',
        message: { value: 'test' },
      };

      const signature = await walletAdapter.signTypedData(mockTypedData);
      expect(signature).toBe('0xSignatureResult');
    });

    it('should maintain consistency between wallet adapter and service methods', async () => {
      const walletAdapter = service.createWalletAdapter();

      // Get chain ID through wallet adapter
      expect(walletAdapter.getChainId).toBeDefined();
      const chainId = await walletAdapter.getChainId?.();

      // Get account through service method
      const accountId = await service.getCurrentAccountId();
      const serviceAddress = service.getUserAddress(accountId);

      // Chain ID should match
      expect(accountId).toContain(`eip155:${chainId}:`);
      expect(accountId).toContain(serviceAddress);
    });
  });
});
