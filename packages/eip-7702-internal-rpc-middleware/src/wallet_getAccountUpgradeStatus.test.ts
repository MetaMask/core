import { rpcErrors } from '@metamask/rpc-errors';
import type { JsonRpcRequest, PendingJsonRpcResponse } from '@metamask/utils';

import type { GetAccountUpgradeStatusParams } from './types';
import { walletGetAccountUpgradeStatus } from './wallet_getAccountUpgradeStatus';

const TEST_ACCOUNT = '0x1234567890123456789012345678901234567890';
const NETWORK_CLIENT_ID = 'mainnet';

const createTestHooks = (): {
  getCode: jest.Mock;
  getCurrentChainIdForDomain: jest.Mock;
  getSelectedNetworkClientIdForChain: jest.Mock;
  getPermittedAccountsForOrigin: jest.Mock;
  isEip7702Supported: jest.Mock;
} => {
  const getCode = jest.fn();
  const getCurrentChainIdForDomain = jest.fn().mockReturnValue('0x1');
  const getPermittedAccountsForOrigin = jest
    .fn()
    .mockResolvedValue([TEST_ACCOUNT]);
  const getSelectedNetworkClientIdForChain = jest
    .fn()
    .mockReturnValue(NETWORK_CLIENT_ID);
  const isEip7702Supported = jest.fn().mockResolvedValue({
    isSupported: true,
    upgradeContractAddress: '0x1234567890123456789012345678901234567890',
  });

  return {
    getCode,
    getCurrentChainIdForDomain,
    getSelectedNetworkClientIdForChain,
    getPermittedAccountsForOrigin,
    isEip7702Supported,
  } as const;
};

const createTestRequest = (
  params: GetAccountUpgradeStatusParams = { account: TEST_ACCOUNT },
): JsonRpcRequest<GetAccountUpgradeStatusParams> & { origin: string } => ({
  id: 1,
  method: 'wallet_getAccountUpgradeStatus',
  jsonrpc: '2.0' as const,
  origin: 'npm:@metamask/gator-permissions-snap',
  params,
});

const createTestResponse = (): PendingJsonRpcResponse => ({
  result: null,
  id: 1,
  jsonrpc: '2.0' as const,
});

describe('walletGetAccountUpgradeStatus', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns non-upgraded account status with real data flow', async () => {
    const hooks = createTestHooks();
    const req = createTestRequest();
    const res = createTestResponse();

    // Mock getCode to return empty code (non-upgraded account)
    hooks.getCode.mockResolvedValue('0x');

    await walletGetAccountUpgradeStatus(req, res, hooks);

    expect(hooks.getCurrentChainIdForDomain).toHaveBeenCalledWith(req.origin);
    expect(hooks.isEip7702Supported).toHaveBeenCalledWith({
      address: TEST_ACCOUNT,
      chainId: '0x1',
    });
    expect(hooks.getSelectedNetworkClientIdForChain).toHaveBeenCalledWith(
      '0x1',
    );
    expect(hooks.getCode).toHaveBeenCalledWith(TEST_ACCOUNT, NETWORK_CLIENT_ID);
    expect(res.result).toStrictEqual({
      account: TEST_ACCOUNT,
      isSupported: true,
      isUpgraded: false,
      upgradedAddress: null,
      chainId: '0x1',
    });
  });

  it('returns upgraded account status with real delegation code', async () => {
    const hooks = createTestHooks();
    const req = createTestRequest();
    const res = createTestResponse();

    // Mock getCode to return valid delegation code (0xef0100 + 40 hex chars for address)
    const upgradedAddress = '0xabcdef1234567890abcdef1234567890abcdef12';
    const delegationCode = `0xef0100${upgradedAddress.slice(2)}`;
    hooks.getCode.mockResolvedValue(delegationCode);

    await walletGetAccountUpgradeStatus(req, res, hooks);

    expect(hooks.getCurrentChainIdForDomain).toHaveBeenCalledWith(req.origin);
    expect(hooks.isEip7702Supported).toHaveBeenCalledWith({
      address: TEST_ACCOUNT,
      chainId: '0x1',
    });
    expect(hooks.getSelectedNetworkClientIdForChain).toHaveBeenCalledWith(
      '0x1',
    );
    expect(hooks.getCode).toHaveBeenCalledWith(TEST_ACCOUNT, NETWORK_CLIENT_ID);
    expect(res.result).toStrictEqual({
      account: TEST_ACCOUNT,
      isSupported: true,
      isUpgraded: true,
      upgradedAddress,
      chainId: '0x1',
    });
  });

  it('works with specific chain ID parameter', async () => {
    const hooks = createTestHooks();
    const req = createTestRequest({
      account: TEST_ACCOUNT,
      chainId: '0xaa36a7',
    });
    const res = createTestResponse();

    // Mock getCode to return non-delegation code
    hooks.getCode.mockResolvedValue('0x1234567890abcdef');

    await walletGetAccountUpgradeStatus(req, res, hooks);

    expect(hooks.getCurrentChainIdForDomain).not.toHaveBeenCalled();
    expect(hooks.isEip7702Supported).toHaveBeenCalledWith({
      address: TEST_ACCOUNT,
      chainId: '0xaa36a7',
    });
    expect(hooks.getSelectedNetworkClientIdForChain).toHaveBeenCalledWith(
      '0xaa36a7',
    );
    expect(hooks.getCode).toHaveBeenCalledWith(TEST_ACCOUNT, NETWORK_CLIENT_ID);
    expect(res.result).toStrictEqual({
      account: TEST_ACCOUNT,
      isSupported: true,
      isUpgraded: false,
      upgradedAddress: null,
      chainId: '0xaa36a7',
    });
  });

  it('propagates validation errors', async () => {
    const hooks = createTestHooks();
    // Create a request with invalid account format to trigger validation error
    const req = {
      id: 1,
      method: 'wallet_getAccountUpgradeStatus',
      jsonrpc: '2.0' as const,
      origin: 'npm:@metamask/gator-permissions-snap',
      params: { account: 'invalid-address' as unknown as `0x${string}` },
    };
    const res = createTestResponse();

    await expect(
      walletGetAccountUpgradeStatus(req, res, hooks),
    ).rejects.toThrow('Invalid parameters');
  });

  it('throws error when current chain ID cannot be determined', async () => {
    const hooks = createTestHooks();
    const req = createTestRequest(); // No chainId provided, should use current
    const res = createTestResponse();

    // Mock getCurrentChainIdForDomain to return null
    hooks.getCurrentChainIdForDomain.mockReturnValue(null);

    await expect(
      walletGetAccountUpgradeStatus(req, res, hooks),
    ).rejects.toThrow(
      rpcErrors.invalidParams({
        message:
          'Could not determine current chain ID for origin: npm:@metamask/gator-permissions-snap',
      }),
    );
  });

  it('calls getSelectedNetworkClientIdForChain with current chain ID when no chainId provided', async () => {
    const hooks = createTestHooks();
    const req = createTestRequest(); // No chainId provided, should use current
    const res = createTestResponse();

    // Mock getCode to return empty code (non-upgraded account)
    hooks.getCode.mockResolvedValue('0x');

    await walletGetAccountUpgradeStatus(req, res, hooks);

    expect(hooks.getCurrentChainIdForDomain).toHaveBeenCalledWith(req.origin);
    expect(hooks.isEip7702Supported).toHaveBeenCalledWith({
      address: TEST_ACCOUNT,
      chainId: '0x1',
    });
    expect(hooks.getSelectedNetworkClientIdForChain).toHaveBeenCalledWith(
      '0x1',
    );
    expect(hooks.getCode).toHaveBeenCalledWith(TEST_ACCOUNT, NETWORK_CLIENT_ID);
    expect(res.result).toStrictEqual({
      account: TEST_ACCOUNT,
      isSupported: true,
      isUpgraded: false,
      upgradedAddress: null,
      chainId: '0x1',
    });
  });

  it('throws error when network client ID is missing', async () => {
    const hooks = createTestHooks();
    const req = createTestRequest({
      account: TEST_ACCOUNT,
      chainId: '0x999',
    });
    const res = createTestResponse();

    // Mock getSelectedNetworkClientIdForChain to return null (network not found)
    hooks.getSelectedNetworkClientIdForChain.mockReturnValue(null);

    await expect(
      walletGetAccountUpgradeStatus(req, res, hooks),
    ).rejects.toThrow(
      rpcErrors.invalidParams({
        message: 'Network client ID not found for chain ID 0x999',
      }),
    );
  });

  it('returns false for delegation code with wrong length', async () => {
    const hooks = createTestHooks();
    const req = createTestRequest();
    const res = createTestResponse();

    // Mock getCode to return delegation code with wrong length
    const wrongLengthCode = '0xef0100abcdef'; // Too short
    hooks.getCode.mockResolvedValue(wrongLengthCode);

    await walletGetAccountUpgradeStatus(req, res, hooks);

    expect(hooks.getCurrentChainIdForDomain).toHaveBeenCalledWith(req.origin);
    expect(hooks.isEip7702Supported).toHaveBeenCalledWith({
      address: TEST_ACCOUNT,
      chainId: '0x1',
    });
    expect(hooks.getSelectedNetworkClientIdForChain).toHaveBeenCalledWith(
      '0x1',
    );
    expect(res.result).toStrictEqual({
      account: TEST_ACCOUNT,
      isSupported: true,
      isUpgraded: false,
      upgradedAddress: null,
      chainId: '0x1',
    });
  });

  it('propagates non-RPC errors as internal errors', async () => {
    const hooks = createTestHooks();
    const req = createTestRequest();
    const res = createTestResponse();

    // Mock getCode to throw a non-RPC error
    hooks.getCode.mockRejectedValue(new Error('Network error'));

    await expect(
      walletGetAccountUpgradeStatus(req, res, hooks),
    ).rejects.toThrow(
      rpcErrors.internal({
        message: 'Failed to get account upgrade status: Network error',
      }),
    );
  });

  it('returns early when EIP-7702 is not supported', async () => {
    const hooks = createTestHooks();
    const req = createTestRequest();
    const res = createTestResponse();

    // Mock isEip7702Supported to return false
    hooks.isEip7702Supported.mockResolvedValue({
      isSupported: false,
    });

    await walletGetAccountUpgradeStatus(req, res, hooks);

    expect(hooks.getCurrentChainIdForDomain).toHaveBeenCalledWith(req.origin);
    expect(hooks.isEip7702Supported).toHaveBeenCalledWith({
      address: TEST_ACCOUNT,
      chainId: '0x1',
    });
    // Should not call getSelectedNetworkClientIdForChain or getCode when not supported
    expect(hooks.getSelectedNetworkClientIdForChain).not.toHaveBeenCalled();
    expect(hooks.getCode).not.toHaveBeenCalled();
    expect(res.result).toStrictEqual({
      account: TEST_ACCOUNT,
      isSupported: false,
      isUpgraded: false,
      upgradedAddress: null,
      chainId: '0x1',
    });
  });

  it('returns early when EIP-7702 is not supported with specific chain ID', async () => {
    const hooks = createTestHooks();
    const req = createTestRequest({
      account: TEST_ACCOUNT,
      chainId: '0xaa36a7',
    });
    const res = createTestResponse();

    // Mock isEip7702Supported to return false
    hooks.isEip7702Supported.mockResolvedValue({
      isSupported: false,
    });

    await walletGetAccountUpgradeStatus(req, res, hooks);

    expect(hooks.getCurrentChainIdForDomain).not.toHaveBeenCalled();
    expect(hooks.isEip7702Supported).toHaveBeenCalledWith({
      address: TEST_ACCOUNT,
      chainId: '0xaa36a7',
    });
    // Should not call getSelectedNetworkClientIdForChain or getCode when not supported
    expect(hooks.getSelectedNetworkClientIdForChain).not.toHaveBeenCalled();
    expect(hooks.getCode).not.toHaveBeenCalled();
    expect(res.result).toStrictEqual({
      account: TEST_ACCOUNT,
      isSupported: false,
      isUpgraded: false,
      upgradedAddress: null,
      chainId: '0xaa36a7',
    });
  });

  it('handles isEip7702Supported hook errors', async () => {
    const hooks = createTestHooks();
    const req = createTestRequest();
    const res = createTestResponse();

    // Mock isEip7702Supported to throw an error
    hooks.isEip7702Supported.mockRejectedValue(
      new Error('EIP-7702 check failed'),
    );

    await expect(
      walletGetAccountUpgradeStatus(req, res, hooks),
    ).rejects.toThrow('EIP-7702 check failed');
  });
});
