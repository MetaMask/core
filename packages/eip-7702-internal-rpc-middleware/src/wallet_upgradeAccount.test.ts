import { rpcErrors } from '@metamask/rpc-errors';
import type {
  JsonRpcRequest,
  PendingJsonRpcResponse,
  Json,
} from '@metamask/utils';

import { walletUpgradeAccount } from './wallet_upgradeAccount';
import type { WalletUpgradeAccountDependencies } from './wallet_upgradeAccount';

const TEST_ACCOUNT = '0x1234567890123456789012345678901234567890';
const UPGRADE_CONTRACT = '0x0000000000000000000000000000000000000000';

const createTestDependencies = (): WalletUpgradeAccountDependencies => {
  const upgradeAccount = jest.fn();
  const getCurrentChainIdForDomain = jest.fn().mockReturnValue('0x1');
  const getAccounts = jest.fn().mockResolvedValue([TEST_ACCOUNT]);
  const isEip7702Supported = jest
    .fn()
    .mockImplementation(async ({ chainIds }: { chainIds: string[] }) => {
      return chainIds.map((chainId: string) => {
        if (chainId === '0x1' || chainId === '0xaa36a7') {
          return {
            chainId,
            isSupported: true,
            upgradeContractAddress: UPGRADE_CONTRACT,
          };
        }
        return {
          chainId,
          isSupported: false,
        };
      });
    });

  return {
    upgradeAccount,
    getCurrentChainIdForDomain,
    isEip7702Supported,
    getAccounts,
  };
};

const createTestRequest = (params: Json[] = [{ account: TEST_ACCOUNT }]): JsonRpcRequest<Json[]> & { origin: string } => ({
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
    const dependencies = createTestDependencies();
    const req = createTestRequest();
    const res = createTestResponse();

    // Mock successful upgrade
    dependencies.upgradeAccount.mockResolvedValue({
      transactionHash: '0xabc123def456789',
      delegatedTo: UPGRADE_CONTRACT,
    });

    await walletUpgradeAccount(req, res, dependencies);

    expect(dependencies.getCurrentChainIdForDomain).toHaveBeenCalledWith(req.origin);
    expect(dependencies.isEip7702Supported).toHaveBeenCalledWith({
      address: TEST_ACCOUNT,
      chainIds: ['0x1'],
    });
    expect(dependencies.upgradeAccount).toHaveBeenCalledWith(
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
    const dependencies = createTestDependencies();
    const req = createTestRequest([{ account: TEST_ACCOUNT, chainId: '0xaa36a7' }]);
    const res = createTestResponse();

    // Mock successful upgrade
    dependencies.upgradeAccount.mockResolvedValue({
      transactionHash: '0xdef456abc123789',
      delegatedTo: UPGRADE_CONTRACT,
    });

    await walletUpgradeAccount(req, res, dependencies);

    expect(dependencies.getCurrentChainIdForDomain).not.toHaveBeenCalled();
    expect(dependencies.isEip7702Supported).toHaveBeenCalledWith({
      address: TEST_ACCOUNT,
      chainIds: ['0xaa36a7'],
    });
    expect(dependencies.upgradeAccount).toHaveBeenCalledWith(
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
    const dependencies = createTestDependencies();
    const req = createTestRequest([]); // Invalid: empty params
    const res = createTestResponse();

    await expect(
      walletUpgradeAccount(req, res, dependencies),
    ).rejects.toThrow();
  });

  it('throws error when EIP-7702 is not supported on the chain', async () => {
    const dependencies = createTestDependencies();
    const req = createTestRequest([{ account: TEST_ACCOUNT, chainId: '0x999' }]);
    const res = createTestResponse();

    // Mock unsupported chain
    dependencies.isEip7702Supported.mockImplementation(async ({ chainIds }: { chainIds: string[] }) => {
      return chainIds.map((chainId: string) => ({
        chainId,
        isSupported: false,
      }));
    });

    await expect(
      walletUpgradeAccount(req, res, dependencies),
    ).rejects.toThrow('Account upgrade not supported on chain ID 0x999');
  });

  it('throws error when no network configuration is found for origin', async () => {
    const dependencies = createTestDependencies();
    const req = createTestRequest();
    const res = createTestResponse();

    // Mock no network configuration found
    dependencies.getCurrentChainIdForDomain.mockReturnValue(null);

    await expect(
      walletUpgradeAccount(req, res, dependencies),
    ).rejects.toThrow('No network configuration found for origin: npm:@metamask/gator-permissions-snap');
  });

  it('propagates upgrade function errors', async () => {
    const dependencies = createTestDependencies();
    const req = createTestRequest();
    const res = createTestResponse();

    // Mock upgrade function to throw an error
    dependencies.upgradeAccount.mockRejectedValue(new Error('Upgrade failed'));

    await expect(
      walletUpgradeAccount(req, res, dependencies),
    ).rejects.toThrow('Failed to upgrade account: Upgrade failed');
  });

  it('throws error when chain has delegation address but is not supported', async () => {
    const dependencies = createTestDependencies();
    const req = createTestRequest([{ account: TEST_ACCOUNT, chainId: '0x999' }]);
    const res = createTestResponse();

    // Mock chain with delegation address but not supported
    dependencies.isEip7702Supported.mockImplementation(async ({ chainIds }: { chainIds: string[] }) => {
      return chainIds.map((chainId: string) => ({
        chainId,
        isSupported: false,
        delegationAddress: '0xdelegation123',
        upgradeContractAddress: UPGRADE_CONTRACT,
      }));
    });

    await expect(
      walletUpgradeAccount(req, res, dependencies),
    ).rejects.toThrow('Account upgrade not supported on chain ID 0x999');
  });

  it('handles non-Error objects in error handling', async () => {
    const dependencies = createTestDependencies();
    const req = createTestRequest();
    const res = createTestResponse();

    // Mock upgrade function to throw a non-Error object
    dependencies.upgradeAccount.mockRejectedValue('String error');

    await expect(
      walletUpgradeAccount(req, res, dependencies),
    ).rejects.toThrow('Failed to upgrade account: String error');
  });
});
