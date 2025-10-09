import { rpcErrors, providerErrors } from '@metamask/rpc-errors';
import type {
  JsonRpcRequest,
  PendingJsonRpcResponse,
  Json,
} from '@metamask/utils';

import { upgradeAccount } from './upgradeAccount';

const TEST_ACCOUNT = '0x1234567890123456789012345678901234567890';
const UPGRADE_CONTRACT = '0x0000000000000000000000000000000000000000';

const createUpgradeHandler = () => {
  const end = jest.fn();
  const next = jest.fn();
  const upgradeAccountFn = jest.fn();
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

  const response = {
    result: null,
    id: 1,
    jsonrpc: '2.0' as const,
  } as PendingJsonRpcResponse;
  const handler = async (
    request: JsonRpcRequest<Json[]> & { origin: string },
  ) => {
    try {
      const result = await upgradeAccount(request, response, {
        upgradeAccount: upgradeAccountFn,
        getCurrentChainIdForDomain,
        isEip7702Supported,
        getAccounts,
      });
      response.result = result;
    } catch (error) {
      end(error);
    }
  };

  return {
    end,
    next,
    upgradeAccount: upgradeAccountFn,
    getCurrentChainIdForDomain,
    isEip7702Supported,
    getAccounts,
    response,
    handler,
  };
};

describe('upgradeAccount', () => {
  it('upgrades account with current chain ID', async () => {
    const {
      upgradeAccount: upgradeAccountFn,
      getCurrentChainIdForDomain,
      response,
      handler,
    } = createUpgradeHandler();
    upgradeAccountFn.mockResolvedValue({
      transactionHash: '0xabc123',
      delegatedTo: UPGRADE_CONTRACT,
    });

    await handler({
      id: 1,
      method: 'wallet_upgradeAccount',
      jsonrpc: '2.0',
      origin: 'npm:@metamask/gator-permissions-snap',
      params: [{ account: TEST_ACCOUNT }],
    });

    expect(getCurrentChainIdForDomain).toHaveBeenCalled();
    expect(upgradeAccountFn).toHaveBeenCalledWith(
      TEST_ACCOUNT,
      UPGRADE_CONTRACT,
      1,
    );
    expect(response.result).toStrictEqual({
      transactionHash: '0xabc123',
      upgradedAccount: TEST_ACCOUNT,
      delegatedTo: UPGRADE_CONTRACT,
    });
  });

  it('upgrades account with specific chain ID', async () => {
    const {
      upgradeAccount: upgradeAccountFn,
      getCurrentChainIdForDomain,
      response,
      handler,
    } = createUpgradeHandler();
    upgradeAccountFn.mockResolvedValue({
      transactionHash: '0xdef456',
      delegatedTo: UPGRADE_CONTRACT,
    });

    await handler({
      id: 1,
      method: 'wallet_upgradeAccount',
      jsonrpc: '2.0',
      origin: 'npm:@metamask/gator-permissions-snap',
      params: [{ account: TEST_ACCOUNT, chainId: 0xaa36a7 }],
    });

    expect(getCurrentChainIdForDomain).not.toHaveBeenCalled();
    expect(upgradeAccountFn).toHaveBeenCalledWith(
      TEST_ACCOUNT,
      UPGRADE_CONTRACT,
      0xaa36a7,
    );
    expect(response.result).toStrictEqual({
      transactionHash: '0xdef456',
      upgradedAccount: TEST_ACCOUNT,
      delegatedTo: UPGRADE_CONTRACT,
    });
  });

  it('rejects invalid parameters', async () => {
    const { end, handler } = createUpgradeHandler();

    await handler({
      id: 1,
      method: 'wallet_upgradeAccount',
      jsonrpc: '2.0',
      origin: 'npm:@metamask/gator-permissions-snap',
      params: [],
    });

    expect(end).toHaveBeenCalledWith(
      rpcErrors.invalidParams({
        message:
          'Invalid parameters\n\n0 - Expected an object, but received: undefined',
      }),
    );
  });

  it('rejects missing account', async () => {
    const { end, handler } = createUpgradeHandler();

    await handler({
      id: 1,
      method: 'wallet_upgradeAccount',
      jsonrpc: '2.0',
      origin: 'npm:@metamask/gator-permissions-snap',
      params: [{}],
    });

    expect(end).toHaveBeenCalledWith(
      rpcErrors.invalidParams({
        message:
          'Invalid parameters\n\n0 > account - Expected a string, but received: undefined',
      }),
    );
  });

  it('rejects unsupported chain', async () => {
    const { end, handler } = createUpgradeHandler();

    await handler({
      id: 1,
      method: 'wallet_upgradeAccount',
      jsonrpc: '2.0',
      origin: 'npm:@metamask/gator-permissions-snap',
      params: [{ account: TEST_ACCOUNT, chainId: 0x999 }],
    });

    expect(end).toHaveBeenCalledWith(
      rpcErrors.invalidParams({
        message: 'Account upgrade not supported on chain ID 2457',
      }),
    );
  });

  it('handles upgrade failure', async () => {
    const {
      end,
      upgradeAccount: upgradeAccountFn,
      handler,
    } = createUpgradeHandler();
    upgradeAccountFn.mockRejectedValue(new Error('Upgrade failed'));

    await handler({
      id: 1,
      method: 'wallet_upgradeAccount',
      jsonrpc: '2.0',
      origin: 'npm:@metamask/gator-permissions-snap',
      params: [{ account: TEST_ACCOUNT }],
    });

    expect(end).toHaveBeenCalledWith(
      rpcErrors.internal({
        message: 'Failed to upgrade account: Upgrade failed',
      }),
    );
  });

  it('handles missing network configuration', async () => {
    const { end, getCurrentChainIdForDomain, handler } = createUpgradeHandler();
    getCurrentChainIdForDomain.mockReturnValue(null);

    await handler({
      id: 1,
      method: 'wallet_upgradeAccount',
      jsonrpc: '2.0',
      origin: 'npm:@metamask/gator-permissions-snap',
      params: [{ account: TEST_ACCOUNT }],
    });

    expect(end).toHaveBeenCalledWith(
      rpcErrors.invalidParams({
        message:
          'No network configuration found for origin: npm:@metamask/gator-permissions-snap',
      }),
    );
  });

  it('rejects invalid address format', async () => {
    const { end, handler } = createUpgradeHandler();

    await handler({
      id: 1,
      method: 'wallet_upgradeAccount',
      jsonrpc: '2.0',
      origin: 'npm:@metamask/gator-permissions-snap',
      params: [{ account: 'invalid-address' }],
    });

    expect(end).toHaveBeenCalledWith(
      rpcErrors.invalidParams({
        message:
          'Invalid parameters\n\n0 > account - Expected a string matching `/^0x[0-9a-fA-F]{40}$/` but received "invalid-address"',
      }),
    );
  });

  it('rejects unauthorized account access', async () => {
    const { end, getAccounts, handler } = createUpgradeHandler();
    getAccounts.mockResolvedValue([
      '0x9999999999999999999999999999999999999999',
    ]); // Different account

    await handler({
      id: 1,
      method: 'wallet_upgradeAccount',
      jsonrpc: '2.0',
      origin: 'npm:@metamask/gator-permissions-snap',
      params: [{ account: TEST_ACCOUNT }],
    });

    expect(end).toHaveBeenCalledWith(providerErrors.unauthorized());
  });

  it('handles upgrade failure with specific error message', async () => {
    const {
      end,
      upgradeAccount: upgradeAccountFn,
      handler,
    } = createUpgradeHandler();
    upgradeAccountFn.mockRejectedValue(
      new Error('Upgrade failed: insufficient funds'),
    );

    await handler({
      id: 1,
      method: 'wallet_upgradeAccount',
      jsonrpc: '2.0',
      origin: 'npm:@metamask/gator-permissions-snap',
      params: [{ account: TEST_ACCOUNT }],
    });

    expect(end).toHaveBeenCalledWith(
      rpcErrors.internal({
        message:
          'Failed to upgrade account: Upgrade failed: insufficient funds',
      }),
    );
  });

  it('handles upgrade failure with non-Error object', async () => {
    const {
      end,
      upgradeAccount: upgradeAccountFn,
      handler,
    } = createUpgradeHandler();
    upgradeAccountFn.mockRejectedValue('String error');

    await handler({
      id: 1,
      method: 'wallet_upgradeAccount',
      jsonrpc: '2.0',
      origin: 'npm:@metamask/gator-permissions-snap',
      params: [{ account: TEST_ACCOUNT }],
    });

    expect(end).toHaveBeenCalledWith(
      rpcErrors.internal({
        message: 'Failed to upgrade account: String error',
      }),
    );
  });

  it('re-throws RPC errors as-is', async () => {
    const {
      end,
      upgradeAccount: upgradeAccountFn,
      handler,
    } = createUpgradeHandler();
    const rpcError = rpcErrors.invalidParams({ message: 'Custom RPC error' });
    upgradeAccountFn.mockRejectedValue(rpcError);

    await handler({
      id: 1,
      method: 'wallet_upgradeAccount',
      jsonrpc: '2.0',
      origin: 'npm:@metamask/gator-permissions-snap',
      params: [{ account: TEST_ACCOUNT }],
    });

    expect(end).toHaveBeenCalledWith(rpcError);
  });

  it('rejects chain with delegation address but not supported', async () => {
    const { end, isEip7702Supported, handler } = createUpgradeHandler();
    isEip7702Supported.mockResolvedValue([
      {
        chainId: '0x1',
        isSupported: false, // Not supported
        delegationAddress: '0x1234567890123456789012345678901234567890', // Has delegation address
        upgradeContractAddress: '0x1234567890123456789012345678901234567890',
      },
    ]);

    await handler({
      id: 1,
      method: 'wallet_upgradeAccount',
      jsonrpc: '2.0',
      origin: 'npm:@metamask/gator-permissions-snap',
      params: [{ account: TEST_ACCOUNT }],
    });

    expect(end).toHaveBeenCalledWith(
      rpcErrors.invalidParams({
        message: 'Account upgrade not supported on chain ID 1',
      }),
    );
  });
});
