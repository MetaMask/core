import { rpcErrors } from '@metamask/rpc-errors';
import type { JsonRpcRequest, PendingJsonRpcResponse } from '@metamask/utils';

import type { UpgradeAccountParams } from './types';
import { walletUpgradeAccount } from './wallet_upgradeAccount';

const TEST_ACCOUNT = '0x1234567890123456789012345678901234567890';
const UPGRADE_CONTRACT = '0x0000000000000000000000000000000000000000';

const createTestHooks = () => {
  const upgradeAccount = jest.fn();
  const getCurrentChainIdForDomain = jest.fn().mockReturnValue('0x1');
  const getPermittedAccountsForOrigin = jest
    .fn()
    .mockResolvedValue([TEST_ACCOUNT]);
  const isEip7702Supported = jest
    .fn()
    .mockImplementation(
      async ({ chainId }: { address: string; chainId: string }) => {
        if (chainId === '0x1' || chainId === '0xaa36a7') {
          return {
            isSupported: true,
            upgradeContractAddress: UPGRADE_CONTRACT,
          };
        }
        return {
          isSupported: false,
        };
      },
    );

  return {
    upgradeAccount,
    getCurrentChainIdForDomain,
    isEip7702Supported,
    getPermittedAccountsForOrigin,
  };
};

const createTestRequest = (
  params: UpgradeAccountParams = { account: TEST_ACCOUNT },
): JsonRpcRequest<UpgradeAccountParams> & { origin: string } => ({
  id: 1,
  method: 'wallet_upgradeAccount',
  jsonrpc: '2.0' as const,
  origin: 'npm:@metamask/gator-permissions-snap',
  params,
});

const createTestResponse = (): PendingJsonRpcResponse => ({
  result: null,
  id: 1,
  jsonrpc: '2.0' as const,
});

describe('walletUpgradeAccount', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('successfully upgrades account with current chain ID', async () => {
    const hooks = createTestHooks();
    const req = createTestRequest();
    const res = createTestResponse();

    // Mock successful upgrade
    hooks.upgradeAccount.mockResolvedValue({
      transactionHash: '0xabc123def456789',
      delegatedTo: UPGRADE_CONTRACT,
    });

    await walletUpgradeAccount(req, res, hooks);

    expect(hooks.getCurrentChainIdForDomain).toHaveBeenCalledWith(req.origin);
    expect(hooks.isEip7702Supported).toHaveBeenCalledWith({
      address: TEST_ACCOUNT,
      chainId: '0x1',
    });
    expect(hooks.upgradeAccount).toHaveBeenCalledWith(
      TEST_ACCOUNT,
      UPGRADE_CONTRACT,
      '0x1',
    );
    expect(res.result).toStrictEqual({
      transactionHash: '0xabc123def456789',
      upgradedAccount: TEST_ACCOUNT,
      delegatedTo: UPGRADE_CONTRACT,
    });
  });

  it('successfully upgrades account with specific chain ID', async () => {
    const hooks = createTestHooks();
    const req = createTestRequest({
      account: TEST_ACCOUNT,
      chainId: '0xaa36a7',
    });
    const res = createTestResponse();

    // Mock successful upgrade
    hooks.upgradeAccount.mockResolvedValue({
      transactionHash: '0xdef456abc123789',
      delegatedTo: UPGRADE_CONTRACT,
    });

    await walletUpgradeAccount(req, res, hooks);

    expect(hooks.getCurrentChainIdForDomain).not.toHaveBeenCalled();
    expect(hooks.isEip7702Supported).toHaveBeenCalledWith({
      address: TEST_ACCOUNT,
      chainId: '0xaa36a7',
    });
    expect(hooks.upgradeAccount).toHaveBeenCalledWith(
      TEST_ACCOUNT,
      UPGRADE_CONTRACT,
      '0xaa36a7',
    );
    expect(res.result).toStrictEqual({
      transactionHash: '0xdef456abc123789',
      upgradedAccount: TEST_ACCOUNT,
      delegatedTo: UPGRADE_CONTRACT,
    });
  });

  it('propagates validation errors', async () => {
    const hooks = createTestHooks();
    // Create a request with invalid account format to trigger validation error
    const req = {
      id: 1,
      method: 'wallet_upgradeAccount',
      jsonrpc: '2.0' as const,
      origin: 'npm:@metamask/gator-permissions-snap',
      params: { account: 'invalid-address' as unknown as `0x${string}` },
    };
    const res = createTestResponse();

    await expect(walletUpgradeAccount(req, res, hooks)).rejects.toThrow(
      'Invalid parameters',
    );
  });

  it('throws error when EIP-7702 is not supported on the chain', async () => {
    const hooks = createTestHooks();
    const req = createTestRequest({
      account: TEST_ACCOUNT,
      chainId: '0x999',
    });
    const res = createTestResponse();

    // Mock unsupported chain
    hooks.isEip7702Supported.mockImplementation(
      async (_: { address: string; chainId: string }) => ({
        isSupported: false,
      }),
    );

    await expect(walletUpgradeAccount(req, res, hooks)).rejects.toThrow(
      rpcErrors.invalidParams({
        message: 'Account upgrade not supported on chain ID 0x999',
      }),
    );
  });

  it('throws error when no network configuration is found for origin', async () => {
    const hooks = createTestHooks();
    const req = createTestRequest();
    const res = createTestResponse();

    // Mock no network configuration found
    hooks.getCurrentChainIdForDomain.mockReturnValue(null);

    await expect(walletUpgradeAccount(req, res, hooks)).rejects.toThrow(
      rpcErrors.invalidParams({
        message:
          'No network configuration found for origin: npm:@metamask/gator-permissions-snap',
      }),
    );
  });

  it('propagates upgrade function errors', async () => {
    const hooks = createTestHooks();
    const req = createTestRequest();
    const res = createTestResponse();

    // Mock upgrade function to throw an error
    hooks.upgradeAccount.mockRejectedValue(new Error('Upgrade failed'));

    await expect(walletUpgradeAccount(req, res, hooks)).rejects.toThrow(
      rpcErrors.internal({
        message: 'Failed to upgrade account: Upgrade failed',
      }),
    );
  });

  it('throws error when chain has delegation address but is not supported', async () => {
    const hooks = createTestHooks();
    const req = createTestRequest({
      account: TEST_ACCOUNT,
      chainId: '0x999',
    });
    const res = createTestResponse();

    // Mock chain with delegation address but not supported
    hooks.isEip7702Supported.mockImplementation(
      async (_: { address: string; chainId: string }) => ({
        isSupported: false,
        upgradeContractAddress: UPGRADE_CONTRACT,
      }),
    );

    await expect(walletUpgradeAccount(req, res, hooks)).rejects.toThrow(
      rpcErrors.invalidParams({
        message: 'Account upgrade not supported on chain ID 0x999',
      }),
    );
  });

  it('handles non-Error objects in error handling', async () => {
    const hooks = createTestHooks();
    const req = createTestRequest();
    const res = createTestResponse();

    // Mock upgrade function to throw a non-Error object
    hooks.upgradeAccount.mockRejectedValue('String error');

    await expect(walletUpgradeAccount(req, res, hooks)).rejects.toThrow(
      rpcErrors.internal({
        message: 'Failed to upgrade account: String error',
      }),
    );
  });

  it('throws error when upgrade contract address is missing', async () => {
    const hooks = createTestHooks();
    const req = createTestRequest();
    const res = createTestResponse();

    // Mock isEip7702Supported to return supported but without upgradeContractAddress
    hooks.isEip7702Supported.mockResolvedValue({
      isSupported: true,
      // upgradeContractAddress is undefined
    });

    await expect(walletUpgradeAccount(req, res, hooks)).rejects.toThrow(
      rpcErrors.invalidParams({
        message: 'No upgrade contract address available for chain ID 0x1',
      }),
    );
  });
});
