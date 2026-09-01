/* eslint-disable */
/**
 * Unit tests for the HyperLiquidWalletService agent-signer seam.
 *
 * Agent mode: when the injected `getAgentSigner` returns a signer for the
 * selected master account, `createWalletAdapter` returns an adapter whose
 * address is the agent's and whose `signTypedData` delegates directly to the
 * local signer — the keyring messenger is never contacted.
 *
 * Master mode: when no signer is available, the existing keyring-backed
 * adapter is returned unchanged.
 */

// Mock keyring-api to avoid import issues with definePattern
jest.mock('@metamask/keyring-api', () => ({
  isEvmAccountType: jest.fn((accountType: string) =>
    accountType?.startsWith('eip155:'),
  ),
}));

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

jest.mock('../../../src/constants/hyperLiquidConfig', () => ({
  getChainId: jest.fn((isTestnet: boolean) => (isTestnet ? '421614' : '42161')),
}));

import { HyperLiquidWalletService } from '../../../src/services/HyperLiquidWalletService.js';
import type { AgentSigner } from '../../../src/services/HyperLiquidWalletService.js';
import {
  createMockInfrastructure,
  createMockEvmAccount,
  createMockMessenger,
} from '../../helpers/serviceMocks.js';

const AGENT_ADDRESS = '0x2222222222222222222222222222222222222222' as const;

const typedDataParams = {
  domain: {
    name: 'HyperLiquid',
    version: '1',
    chainId: 42161,
    verifyingContract:
      '0x0000000000000000000000000000000000000000' as `0x${string}`,
  },
  types: {
    // The SDK's viem adapters inject this before calling params-style
    // wallets; an ethers-style local signer must not receive it.
    EIP712Domain: [
      { name: 'name', type: 'string' },
      { name: 'version', type: 'string' },
      { name: 'chainId', type: 'uint256' },
      { name: 'verifyingContract', type: 'address' },
    ],
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

describe('HyperLiquidWalletService agent signer seam', () => {
  let mockDeps: ReturnType<typeof createMockInfrastructure>;
  let mockMessenger: ReturnType<typeof createMockMessenger>;
  const mockEvmAccount = createMockEvmAccount();

  beforeEach(() => {
    jest.clearAllMocks();
    mockDeps = createMockInfrastructure();
    mockMessenger = createMockMessenger();
  });

  describe('agent mode', () => {
    it('returns an adapter whose address is the agent address', async () => {
      const agentSigner: AgentSigner = {
        address: AGENT_ADDRESS,
        signTypedData: jest.fn().mockResolvedValue('0xagentsig'),
      };
      const service = new HyperLiquidWalletService(mockDeps, mockMessenger, {
        getAgentSigner: jest.fn().mockResolvedValue(agentSigner),
      });

      const adapter = await service.createWalletAdapter();

      expect(adapter.address).toBe(AGENT_ADDRESS);
    });

    it('passes the selected master account address to getAgentSigner', async () => {
      const getAgentSigner = jest.fn().mockResolvedValue(null);
      const service = new HyperLiquidWalletService(mockDeps, mockMessenger, {
        getAgentSigner,
      });

      await service.createWalletAdapter();

      expect(getAgentSigner).toHaveBeenCalledWith(mockEvmAccount.address);
    });

    it('delegates signing directly to the injected signer with no keyring call', async () => {
      const signTypedData = jest.fn().mockResolvedValue('0xagentsig');
      const agentSigner: AgentSigner = {
        address: AGENT_ADDRESS,
        signTypedData,
      };
      const service = new HyperLiquidWalletService(mockDeps, mockMessenger, {
        getAgentSigner: jest.fn().mockResolvedValue(agentSigner),
      });

      const adapter = await service.createWalletAdapter();
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
      const agentSigner: AgentSigner = {
        address: AGENT_ADDRESS,
        signTypedData,
      };
      const service = new HyperLiquidWalletService(mockDeps, mockMessenger, {
        getAgentSigner: jest.fn().mockResolvedValue(agentSigner),
      });

      const adapter = await service.createWalletAdapter();
      await adapter.signTypedData(typedDataParams);

      const [domain, types, value] = signTypedData.mock.calls[0];
      expect(domain).toBe(typedDataParams.domain);
      expect(types).toEqual({ Agent: typedDataParams.types.Agent });
      expect(value).toEqual(typedDataParams.message);
    });

    it('signs with the agent adapter even when the keyring reports locked', async () => {
      const signTypedData = jest.fn().mockResolvedValue('0xagentsig');
      const agentSigner: AgentSigner = {
        address: AGENT_ADDRESS,
        signTypedData,
      };
      const service = new HyperLiquidWalletService(mockDeps, mockMessenger, {
        getAgentSigner: jest.fn().mockResolvedValue(agentSigner),
      });
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

      const adapter = await service.createWalletAdapter();
      const signature = await adapter.signTypedData(typedDataParams);

      expect(signature).toBe('0xagentsig');
    });
  });

  describe('master mode', () => {
    it('returns the keyring-backed adapter when getAgentSigner returns null', async () => {
      const service = new HyperLiquidWalletService(mockDeps, mockMessenger, {
        getAgentSigner: jest.fn().mockResolvedValue(null),
      });

      const adapter = await service.createWalletAdapter();

      expect(adapter.address).toBe(mockEvmAccount.address);
      const signature = await adapter.signTypedData(typedDataParams);
      expect(signature).toBe('0xSignatureResult');
      expect(mockMessenger.call).toHaveBeenCalledWith(
        'KeyringController:signTypedMessage',
        {
          from: mockEvmAccount.address,
          data: {
            domain: typedDataParams.domain,
            types: typedDataParams.types,
            primaryType: typedDataParams.primaryType,
            message: typedDataParams.message,
          },
        },
        'V4',
      );
    });

    it('uses the master path when no getAgentSigner option is provided', async () => {
      const service = new HyperLiquidWalletService(mockDeps, mockMessenger);

      const adapter = await service.createWalletAdapter();

      expect(adapter.address).toBe(mockEvmAccount.address);
      const signature = await adapter.signTypedData(typedDataParams);
      expect(signature).toBe('0xSignatureResult');
      expect(mockMessenger.call).toHaveBeenCalledWith(
        'KeyringController:signTypedMessage',
        expect.anything(),
        'V4',
      );
    });
  });
});
