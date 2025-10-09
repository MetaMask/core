import { rpcErrors } from '@metamask/rpc-errors';
import type {
  JsonRpcRequest,
  PendingJsonRpcResponse,
  Json,
} from '@metamask/utils';

import { walletGetAccountUpgradeStatus } from './wallet_getAccountUpgradeStatus';
import type { WalletGetAccountUpgradeStatusDependencies } from './wallet_getAccountUpgradeStatus';

const TEST_ACCOUNT = '0x1234567890123456789012345678901234567890';
const NETWORK_CLIENT_ID = 'mainnet';

const createTestDependencies = (): WalletGetAccountUpgradeStatusDependencies => {
  const getCode = jest.fn();
  const getCurrentChainIdForDomain = jest.fn().mockReturnValue('0x1');
  const getAccounts = jest.fn().mockResolvedValue([TEST_ACCOUNT]);
  const getNetworkConfigurationByChainId = jest.fn().mockReturnValue({
    rpcEndpoints: [{ networkClientId: NETWORK_CLIENT_ID }],
    defaultRpcEndpointIndex: 0,
  });

  return {
    getCode,
    getCurrentChainIdForDomain,
    getNetworkConfigurationByChainId,
    getAccounts,
  };
};

const createTestRequest = (params: Json[] = [{ account: TEST_ACCOUNT }]): JsonRpcRequest<Json[]> & { origin: string } => ({
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
    const dependencies = createTestDependencies();
    const req = createTestRequest();
    const res = createTestResponse();

    // Mock getCode to return empty code (non-upgraded account)
    dependencies.getCode.mockResolvedValue('0x');

    await walletGetAccountUpgradeStatus(req, res, dependencies);

    expect(dependencies.getCurrentChainIdForDomain).toHaveBeenCalledWith(req.origin);
    expect(dependencies.getCode).toHaveBeenCalledWith(TEST_ACCOUNT, NETWORK_CLIENT_ID);
    expect(res.result).toStrictEqual({
      account: TEST_ACCOUNT,
      isUpgraded: false,
      upgradedAddress: null,
      chainId: '0x1',
    });
  });

  it('returns upgraded account status with real delegation code', async () => {
    const dependencies = createTestDependencies();
    const req = createTestRequest();
    const res = createTestResponse();

    // Mock getCode to return valid delegation code (0xef0100 + 40 hex chars for address)
    const upgradedAddress = '0xabcdef1234567890abcdef1234567890abcdef12';
    const delegationCode = `0xef0100${upgradedAddress.slice(2)}`;
    dependencies.getCode.mockResolvedValue(delegationCode);

    await walletGetAccountUpgradeStatus(req, res, dependencies);

    expect(dependencies.getCurrentChainIdForDomain).toHaveBeenCalledWith(req.origin);
    expect(dependencies.getCode).toHaveBeenCalledWith(TEST_ACCOUNT, NETWORK_CLIENT_ID);
    expect(res.result).toStrictEqual({
      account: TEST_ACCOUNT,
      isUpgraded: true,
      upgradedAddress,
      chainId: '0x1',
    });
  });

  it('works with specific chain ID parameter', async () => {
    const dependencies = createTestDependencies();
    const req = createTestRequest([{ account: TEST_ACCOUNT, chainId: '0xaa36a7' }]);
    const res = createTestResponse();

    // Mock getCode to return non-delegation code
    dependencies.getCode.mockResolvedValue('0x1234567890abcdef');

    await walletGetAccountUpgradeStatus(req, res, dependencies);

    expect(dependencies.getCurrentChainIdForDomain).not.toHaveBeenCalled();
    expect(dependencies.getNetworkConfigurationByChainId).toHaveBeenCalledWith('0xaa36a7');
    expect(dependencies.getCode).toHaveBeenCalledWith(TEST_ACCOUNT, NETWORK_CLIENT_ID);
    expect(res.result).toStrictEqual({
      account: TEST_ACCOUNT,
      isUpgraded: false,
      upgradedAddress: null,
      chainId: '0xaa36a7',
    });
  });

  it('propagates validation errors', async () => {
    const dependencies = createTestDependencies();
    const req = createTestRequest([]); // Invalid: empty params
    const res = createTestResponse();

    await expect(
      walletGetAccountUpgradeStatus(req, res, dependencies),
    ).rejects.toThrow();
  });

  it('propagates network configuration errors', async () => {
    const dependencies = createTestDependencies();
    const req = createTestRequest([{ account: TEST_ACCOUNT, chainId: '0x999' }]);
    const res = createTestResponse();

    // Mock network configuration to return null (network not found)
    dependencies.getNetworkConfigurationByChainId.mockReturnValue(null);

    await expect(
      walletGetAccountUpgradeStatus(req, res, dependencies),
    ).rejects.toThrow('Network not found for chain ID 0x999');
  });
});
