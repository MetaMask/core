import { rpcErrors, providerErrors } from '@metamask/rpc-errors';
import type {
  JsonRpcRequest,
  PendingJsonRpcResponse,
  Json,
} from '@metamask/utils';

import { getAccountUpgradeStatus } from './getAccountUpgradeStatus';

// No need to mock @metamask/eip7702-utils since we're using a local implementation

const TEST_ACCOUNT = '0x1234567890123456789012345678901234567890';
const NETWORK_CLIENT_ID = 'mainnet';

const createStatusHandler = () => {
  const end = jest.fn();
  const next = jest.fn();
  const getCode = jest.fn();
  const getCurrentChainIdForDomain = jest.fn().mockReturnValue('0x1');
  const getAccounts = jest.fn().mockResolvedValue([TEST_ACCOUNT]);
  const getNetworkConfigurationByChainId = jest.fn().mockReturnValue({
    rpcEndpoints: [{ networkClientId: NETWORK_CLIENT_ID }],
    defaultRpcEndpointIndex: 0,
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
      const result = await getAccountUpgradeStatus(request, response, {
        getCurrentChainIdForDomain,
        getCode,
        getNetworkConfigurationByChainId,
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
    getCode,
    getCurrentChainIdForDomain,
    getNetworkConfigurationByChainId,
    getAccounts,
    response,
    handler,
  };
};

describe('getAccountUpgradeStatus', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('gets account upgrade status with current chain ID', async () => {
    const { getCode, getCurrentChainIdForDomain, response, handler } =
      createStatusHandler();

    // Mock getCode to return non-empty code to simulate upgraded account
    getCode.mockResolvedValue('0x1234567890abcdef');

    await handler({
      id: 1,
      method: 'wallet_getAccountUpgradeStatus',
      jsonrpc: '2.0',
      origin: 'npm:@metamask/gator-permissions-snap',
      params: [{ account: TEST_ACCOUNT }],
    });

    expect(getCurrentChainIdForDomain).toHaveBeenCalled();
    expect(getCode).toHaveBeenCalledWith(TEST_ACCOUNT, NETWORK_CLIENT_ID);
    expect(response.result).toStrictEqual({
      account: TEST_ACCOUNT,
      isUpgraded: true,
      chainId: 1,
    });
  });

  it('gets account upgrade status with specific chain ID', async () => {
    const {
      getCode,
      getCurrentChainIdForDomain,
      getNetworkConfigurationByChainId,
      response,
      handler,
    } = createStatusHandler();

    // Mock getCode to return empty code to simulate non-upgraded account
    getCode.mockResolvedValue('0x');

    await handler({
      id: 1,
      method: 'wallet_getAccountUpgradeStatus',
      jsonrpc: '2.0',
      origin: 'npm:@metamask/gator-permissions-snap',
      params: [{ account: TEST_ACCOUNT, chainId: 0xaa36a7 }],
    });

    expect(getCurrentChainIdForDomain).not.toHaveBeenCalled();
    expect(getNetworkConfigurationByChainId).toHaveBeenCalledWith('0xaa36a7');
    expect(getCode).toHaveBeenCalledWith(TEST_ACCOUNT, NETWORK_CLIENT_ID);
    expect(response.result).toStrictEqual({
      account: TEST_ACCOUNT,
      isUpgraded: false,
      chainId: 0xaa36a7,
    });
  });

  it('rejects invalid parameters', async () => {
    const { end, handler } = createStatusHandler();

    await handler({
      id: 1,
      method: 'wallet_getAccountUpgradeStatus',
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
    const { end, handler } = createStatusHandler();

    await handler({
      id: 1,
      method: 'wallet_getAccountUpgradeStatus',
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

  it('rejects missing network configuration', async () => {
    const { end, getNetworkConfigurationByChainId, handler } =
      createStatusHandler();
    getNetworkConfigurationByChainId.mockReturnValue(null);

    await handler({
      id: 1,
      method: 'wallet_getAccountUpgradeStatus',
      jsonrpc: '2.0',
      origin: 'npm:@metamask/gator-permissions-snap',
      params: [{ account: TEST_ACCOUNT, chainId: 0x999 }],
    });

    expect(end).toHaveBeenCalledWith(
      rpcErrors.invalidParams({
        message: 'Network not found for chain ID 2457',
      }),
    );
  });

  it('rejects invalid network configuration', async () => {
    const { end, getNetworkConfigurationByChainId, handler } =
      createStatusHandler();
    getNetworkConfigurationByChainId.mockReturnValue({
      rpcEndpoints: undefined,
      defaultRpcEndpointIndex: undefined,
    });

    await handler({
      id: 1,
      method: 'wallet_getAccountUpgradeStatus',
      jsonrpc: '2.0',
      origin: 'npm:@metamask/gator-permissions-snap',
      params: [{ account: TEST_ACCOUNT, chainId: 0x1 }],
    });

    expect(end).toHaveBeenCalledWith(
      rpcErrors.invalidParams({
        message: 'Network configuration invalid for chain ID 1',
      }),
    );
  });

  it('rejects missing network client ID', async () => {
    const { end, getNetworkConfigurationByChainId, handler } =
      createStatusHandler();
    getNetworkConfigurationByChainId.mockReturnValue({
      rpcEndpoints: [{ networkClientId: undefined }],
      defaultRpcEndpointIndex: 0,
    });

    await handler({
      id: 1,
      method: 'wallet_getAccountUpgradeStatus',
      jsonrpc: '2.0',
      origin: 'npm:@metamask/gator-permissions-snap',
      params: [{ account: TEST_ACCOUNT, chainId: 0x1 }],
    });

    expect(end).toHaveBeenCalledWith(
      rpcErrors.invalidParams({
        message: 'Network client ID not found for chain ID 1',
      }),
    );
  });

  it('handles status check failure', async () => {
    const { end, getCode, handler } = createStatusHandler();

    // Mock getCode to throw an error
    getCode.mockRejectedValue(new Error('Status check failed'));

    await handler({
      id: 1,
      method: 'wallet_getAccountUpgradeStatus',
      jsonrpc: '2.0',
      origin: 'npm:@metamask/gator-permissions-snap',
      params: [{ account: TEST_ACCOUNT }],
    });

    expect(end).toHaveBeenCalledWith(
      rpcErrors.internal({
        message: 'Failed to get account upgrade status: Status check failed',
      }),
    );
  });

  it('handles missing network configuration for current chain', async () => {
    const { end, getCurrentChainIdForDomain, handler } = createStatusHandler();
    getCurrentChainIdForDomain.mockReturnValue(null);

    await handler({
      id: 1,
      method: 'wallet_getAccountUpgradeStatus',
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
    const { end, handler } = createStatusHandler();

    await handler({
      id: 1,
      method: 'wallet_getAccountUpgradeStatus',
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
    const { end, getAccounts, handler } = createStatusHandler();
    getAccounts.mockResolvedValue([
      '0x9999999999999999999999999999999999999999',
    ]); // Different account

    await handler({
      id: 1,
      method: 'wallet_getAccountUpgradeStatus',
      jsonrpc: '2.0',
      origin: 'npm:@metamask/gator-permissions-snap',
      params: [{ account: TEST_ACCOUNT }],
    });

    expect(end).toHaveBeenCalledWith(providerErrors.unauthorized());
  });

  it('handles getAccountUpgradeStatus failure with specific error message', async () => {
    const { end, getCode, handler } = createStatusHandler();
    getCode.mockRejectedValue(new Error('Network error: connection failed'));

    await handler({
      id: 1,
      method: 'wallet_getAccountUpgradeStatus',
      jsonrpc: '2.0',
      origin: 'npm:@metamask/gator-permissions-snap',
      params: [{ account: TEST_ACCOUNT }],
    });

    expect(end).toHaveBeenCalledWith(
      rpcErrors.internal({
        message:
          'Failed to get account upgrade status: Network error: connection failed',
      }),
    );
  });

  it('handles getAccountUpgradeStatus failure with non-Error object', async () => {
    const { end, getCode, handler } = createStatusHandler();
    getCode.mockRejectedValue('String error');

    await handler({
      id: 1,
      method: 'wallet_getAccountUpgradeStatus',
      jsonrpc: '2.0',
      origin: 'npm:@metamask/gator-permissions-snap',
      params: [{ account: TEST_ACCOUNT }],
    });

    expect(end).toHaveBeenCalledWith(
      rpcErrors.internal({
        message: 'Failed to get account upgrade status: String error',
      }),
    );
  });

  it('re-throws RPC errors as-is in getAccountUpgradeStatus', async () => {
    const { end, getCode, handler } = createStatusHandler();
    const rpcError = rpcErrors.invalidParams({ message: 'Custom RPC error' });
    getCode.mockRejectedValue(rpcError);

    await handler({
      id: 1,
      method: 'wallet_getAccountUpgradeStatus',
      jsonrpc: '2.0',
      origin: 'npm:@metamask/gator-permissions-snap',
      params: [{ account: TEST_ACCOUNT }],
    });

    expect(end).toHaveBeenCalledWith(rpcError);
  });
});
