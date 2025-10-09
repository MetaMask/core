import type {
  JsonRpcRequest,
  PendingJsonRpcResponse,
  Json,
} from '@metamask/utils';

import { walletGetAccountUpgradeStatus } from './wallet_getAccountUpgradeStatus';
import type { WalletGetAccountUpgradeStatusHooks } from './wallet_getAccountUpgradeStatus';

type TestHooks = {
  [K in keyof WalletGetAccountUpgradeStatusHooks]: jest.MockedFunction<
    WalletGetAccountUpgradeStatusHooks[K]
  >;
};

const TEST_ACCOUNT = '0x1234567890123456789012345678901234567890';
const NETWORK_CLIENT_ID = 'mainnet';

const createTestHooks = (): TestHooks => {
  const getCode = jest.fn();
  const getCurrentChainIdForDomain = jest.fn().mockReturnValue('0x1');
  const getPermittedAccountsForOrigin = jest
    .fn()
    .mockResolvedValue([TEST_ACCOUNT]);
  const getNetworkConfigurationByChainId = jest.fn().mockReturnValue({
    rpcEndpoints: [{ networkClientId: NETWORK_CLIENT_ID }],
    defaultRpcEndpointIndex: 0,
  });

  return {
    getCode,
    getCurrentChainIdForDomain,
    getNetworkConfigurationByChainId,
    getPermittedAccountsForOrigin,
  };
};

const createTestRequest = (
  params: Json[] = [{ account: TEST_ACCOUNT }],
): JsonRpcRequest<Json[]> & { origin: string } => ({
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
    expect(hooks.getCode).toHaveBeenCalledWith(TEST_ACCOUNT, NETWORK_CLIENT_ID);
    expect(res.result).toStrictEqual({
      account: TEST_ACCOUNT,
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
    expect(hooks.getCode).toHaveBeenCalledWith(TEST_ACCOUNT, NETWORK_CLIENT_ID);
    expect(res.result).toStrictEqual({
      account: TEST_ACCOUNT,
      isUpgraded: true,
      upgradedAddress,
      chainId: '0x1',
    });
  });

  it('works with specific chain ID parameter', async () => {
    const hooks = createTestHooks();
    const req = createTestRequest([
      { account: TEST_ACCOUNT, chainId: '0xaa36a7' },
    ]);
    const res = createTestResponse();

    // Mock getCode to return non-delegation code
    hooks.getCode.mockResolvedValue('0x1234567890abcdef');

    await walletGetAccountUpgradeStatus(req, res, hooks);

    expect(hooks.getCurrentChainIdForDomain).not.toHaveBeenCalled();
    expect(hooks.getNetworkConfigurationByChainId).toHaveBeenCalledWith(
      '0xaa36a7',
    );
    expect(hooks.getCode).toHaveBeenCalledWith(TEST_ACCOUNT, NETWORK_CLIENT_ID);
    expect(res.result).toStrictEqual({
      account: TEST_ACCOUNT,
      isUpgraded: false,
      upgradedAddress: null,
      chainId: '0xaa36a7',
    });
  });

  it('propagates validation errors', async () => {
    const hooks = createTestHooks();
    const req = createTestRequest([]); // Invalid: empty params
    const res = createTestResponse();

    await expect(
      walletGetAccountUpgradeStatus(req, res, hooks),
    ).rejects.toThrow('Invalid parameters');
  });

  it('propagates network configuration errors', async () => {
    const hooks = createTestHooks();
    const req = createTestRequest([
      { account: TEST_ACCOUNT, chainId: '0x999' },
    ]);
    const res = createTestResponse();

    // Mock network configuration to return null (network not found)
    hooks.getNetworkConfigurationByChainId.mockReturnValue(null);

    await expect(
      walletGetAccountUpgradeStatus(req, res, hooks),
    ).rejects.toThrow('Network not found for chain ID 0x999');
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
      'Could not determine current chain ID for origin: npm:@metamask/gator-permissions-snap',
    );
  });

  it('throws error when network configuration is invalid (missing rpcEndpoints)', async () => {
    const hooks = createTestHooks();
    const req = createTestRequest([
      { account: TEST_ACCOUNT, chainId: '0x999' },
    ]);
    const res = createTestResponse();

    // Mock network configuration with missing rpcEndpoints
    hooks.getNetworkConfigurationByChainId.mockReturnValue({
      rpcEndpoints: undefined,
      defaultRpcEndpointIndex: 0,
    });

    await expect(
      walletGetAccountUpgradeStatus(req, res, hooks),
    ).rejects.toThrow('Network configuration invalid for chain ID 0x999');
  });

  it('throws error when network configuration is invalid (invalid defaultRpcEndpointIndex)', async () => {
    const hooks = createTestHooks();
    const req = createTestRequest([
      { account: TEST_ACCOUNT, chainId: '0x999' },
    ]);
    const res = createTestResponse();

    // Mock network configuration with invalid defaultRpcEndpointIndex
    hooks.getNetworkConfigurationByChainId.mockReturnValue({
      rpcEndpoints: [{ networkClientId: NETWORK_CLIENT_ID }],
      defaultRpcEndpointIndex: 5, // Out of bounds
    });

    await expect(
      walletGetAccountUpgradeStatus(req, res, hooks),
    ).rejects.toThrow('Network configuration invalid for chain ID 0x999');
  });

  it('throws error when network client ID is missing', async () => {
    const hooks = createTestHooks();
    const req = createTestRequest([
      { account: TEST_ACCOUNT, chainId: '0x999' },
    ]);
    const res = createTestResponse();

    // Mock network configuration with missing networkClientId
    hooks.getNetworkConfigurationByChainId.mockReturnValue({
      rpcEndpoints: [{}] as { networkClientId: string }[],
      defaultRpcEndpointIndex: 0,
    });

    await expect(
      walletGetAccountUpgradeStatus(req, res, hooks),
    ).rejects.toThrow('Network client ID not found for chain ID 0x999');
  });

  it('returns false for delegation code with wrong length', async () => {
    const hooks = createTestHooks();
    const req = createTestRequest();
    const res = createTestResponse();

    // Mock getCode to return delegation code with wrong length
    const wrongLengthCode = '0xef0100abcdef'; // Too short
    hooks.getCode.mockResolvedValue(wrongLengthCode);

    await walletGetAccountUpgradeStatus(req, res, hooks);

    expect(res.result).toStrictEqual({
      account: TEST_ACCOUNT,
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
    ).rejects.toThrow('Failed to get account upgrade status: Network error');
  });
});
