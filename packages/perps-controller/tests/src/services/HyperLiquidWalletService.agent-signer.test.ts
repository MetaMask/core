/* eslint-disable */
/**
 * Unit tests for the HyperLiquidWalletService agent-signer seam.
 *
 * Agent mode: `createAgentWalletAdapter` returns an adapter whose address is
 * the agent's and whose `signTypedData` delegates L1 actions to the local
 * signer — the keyring messenger is never contacted for those.
 *
 * Master mode: `createWalletAdapter` is a synchronous master-keyring factory.
 * It does not look up an agent signer; the provider selects the agent adapter
 * via `#buildWallet` / `setTradingWalletOverride`.
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

  const createAgentAdapter = (signTypedData: jest.Mock = jest.fn()) => {
    const agentSigner: AgentSigner = {
      address: AGENT_ADDRESS,
      signTypedData,
    };
    const service = new HyperLiquidWalletService(mockDeps, mockMessenger);
    return {
      service,
      agentSigner,
      adapter: service.createAgentWalletAdapter(agentSigner),
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
        EIP712Domain: [
          { name: 'name', type: 'string' },
          { name: 'version', type: 'string' },
          { name: 'chainId', type: 'uint256' },
          { name: 'verifyingContract', type: 'address' },
        ],
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
        EIP712Domain: [
          { name: 'name', type: 'string' },
          { name: 'version', type: 'string' },
          { name: 'chainId', type: 'uint256' },
          { name: 'verifyingContract', type: 'address' },
        ],
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

  describe('master mode', () => {
    it('returns the keyring-backed adapter synchronously', () => {
      const service = new HyperLiquidWalletService(mockDeps, mockMessenger);

      const adapter = service.createWalletAdapter();

      expect(adapter).not.toBeInstanceOf(Promise);
      expect(adapter.address).toBe(mockEvmAccount.address);
    });

    it('uses the master path when creating the default wallet adapter', async () => {
      const service = new HyperLiquidWalletService(mockDeps, mockMessenger);

      const adapter = service.createWalletAdapter();
      const signature = await adapter.signTypedData(typedDataParams);

      expect(signature).toBe('0xSignatureResult');
      expect(mockMessenger.call).toHaveBeenCalledWith(
        'KeyringController:signTypedMessage',
        expect.anything(),
        'V4',
      );
    });

    it('routes Exchange-domain Agent actions through the keyring in master mode', async () => {
      const service = new HyperLiquidWalletService(mockDeps, mockMessenger);

      const adapter = service.createWalletAdapter();
      const signature = await adapter.signTypedData({
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
