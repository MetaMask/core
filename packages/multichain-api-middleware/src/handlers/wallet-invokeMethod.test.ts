import * as chainAgnosticPermissionModule from '@metamask/chain-agnostic-permission';
import { providerErrors, rpcErrors } from '@metamask/rpc-errors';

import type { WalletInvokeMethodRequest } from './wallet-invokeMethod';
import { walletInvokeMethod } from './wallet-invokeMethod';

// Allow individual modules to be mocked
jest.mock('@metamask/chain-agnostic-permission', () => ({
  ...jest.requireActual('@metamask/chain-agnostic-permission'),
  __esModule: true,
}));

const { Caip25CaveatType, Caip25EndowmentPermissionName } =
  chainAgnosticPermissionModule;

const createMockedRequest = () => ({
  jsonrpc: '2.0' as const,
  id: 0,
  origin: 'http://test.com',
  method: 'wallet_invokeMethod',
  params: {
    scope: 'eip155:1',
    request: {
      method: 'eth_call',
      params: {
        foo: 'bar',
      },
    },
  },
});

const createMockedHandler = () => {
  const next = jest.fn();
  const end = jest.fn();
  const getCaveatForOrigin = jest.fn().mockReturnValue({
    value: {
      requiredScopes: {
        'eip155:1': {
          accounts: [],
        },
        'eip155:5': {
          accounts: [],
        },
      },
      optionalScopes: {
        'eip155:1': {
          accounts: [],
        },
        wallet: {
          accounts: [],
        },
      },
      isMultichainOrigin: true,
    },
  });
  const findNetworkClientIdByChainId = jest.fn().mockReturnValue('mainnet');
  const getSelectedNetworkClientId = jest
    .fn()
    .mockReturnValue('selectedNetworkClientId');
  const getNonEvmSupportedMethods = jest.fn().mockReturnValue([]);
  const handleNonEvmRequestForOrigin = jest.fn().mockResolvedValue(null);
  const response = { jsonrpc: '2.0' as const, id: 1 };
  const handler = (request: WalletInvokeMethodRequest) =>
    walletInvokeMethod.implementation(request, response, next, end, {
      getCaveatForOrigin,
      findNetworkClientIdByChainId,
      getSelectedNetworkClientId,
      getNonEvmSupportedMethods,
      handleNonEvmRequestForOrigin,
    });

  return {
    response,
    next,
    end,
    getCaveatForOrigin,
    findNetworkClientIdByChainId,
    getSelectedNetworkClientId,
    getNonEvmSupportedMethods,
    handleNonEvmRequestForOrigin,
    handler,
  };
};

describe('wallet_invokeMethod', () => {
  beforeEach(() => {
    jest
      .spyOn(chainAgnosticPermissionModule, 'getSessionScopes')
      .mockReturnValue({
        'eip155:1': {
          methods: ['eth_call', 'net_version'],
          notifications: [],
          accounts: [],
        },
        'eip155:5': {
          methods: ['eth_chainId'],
          notifications: [],
          accounts: [],
        },
        wallet: {
          methods: ['wallet_watchAsset'],
          notifications: [],
          accounts: [],
        },
        'wallet:eip155': {
          methods: ['wallet_watchAsset'],
          notifications: [],
          accounts: [],
        },
        'nonevm:scope': {
          methods: ['foobar'],
          notifications: [],
          accounts: ['nonevm:scope:0x1'],
        },
      });
  });

  it('gets the authorized scopes from the CAIP-25 endowment permission', async () => {
    const request = createMockedRequest();
    const { handler, getCaveatForOrigin } = createMockedHandler();
    await handler(request);
    expect(getCaveatForOrigin).toHaveBeenCalledWith(
      Caip25EndowmentPermissionName,
      Caip25CaveatType,
    );
  });

  it('gets the session scopes from the CAIP-25 caveat value', async () => {
    const request = createMockedRequest();
    const { handler, getNonEvmSupportedMethods } = createMockedHandler();
    await handler(request);
    expect(chainAgnosticPermissionModule.getSessionScopes).toHaveBeenCalledWith(
      {
        requiredScopes: {
          'eip155:1': {
            accounts: [],
          },
          'eip155:5': {
            accounts: [],
          },
        },
        optionalScopes: {
          'eip155:1': {
            accounts: [],
          },
          wallet: {
            accounts: [],
          },
        },
        isMultichainOrigin: true,
      },
      {
        getNonEvmSupportedMethods,
      },
    );
  });

  it('throws an unauthorized error when there is no CAIP-25 endowment permission', async () => {
    const request = createMockedRequest();
    const { handler, getCaveatForOrigin, end } = createMockedHandler();
    getCaveatForOrigin.mockImplementation(() => {
      throw new Error('permission not found');
    });
    await handler(request);
    expect(end).toHaveBeenCalledWith(providerErrors.unauthorized());
  });

  it('throws an unauthorized error when the CAIP-25 endowment permission was not granted from the multichain flow', async () => {
    const request = createMockedRequest();
    const { handler, getCaveatForOrigin, end } = createMockedHandler();
    getCaveatForOrigin.mockReturnValue({
      value: {
        isMultichainOrigin: false,
      },
    });
    await handler(request);
    expect(end).toHaveBeenCalledWith(providerErrors.unauthorized());
  });

  it('throws an unauthorized error if the requested scope is not authorized', async () => {
    const request = createMockedRequest();
    const { handler, end } = createMockedHandler();

    await handler({
      ...request,
      params: {
        ...request.params,
        scope: 'eip155:999',
      },
    });
    expect(end).toHaveBeenCalledWith(providerErrors.unauthorized());
  });

  it('throws an unauthorized error if the requested scope method is not authorized', async () => {
    const request = createMockedRequest();
    const { handler, end } = createMockedHandler();

    await handler({
      ...request,
      params: {
        ...request.params,
        request: {
          ...request.params.request,
          method: 'unauthorized_method',
        },
      },
    });
    expect(end).toHaveBeenCalledWith(providerErrors.unauthorized());
  });

  describe('ethereum scope', () => {
    it('gets the networkClientId for the chainId', async () => {
      const request = createMockedRequest();
      const { handler, findNetworkClientIdByChainId } = createMockedHandler();

      await handler(request);
      expect(findNetworkClientIdByChainId).toHaveBeenCalledWith('0x1');
    });

    it('throws an internal error if a networkClientId does not exist for the chainId', async () => {
      const request = createMockedRequest();
      const { handler, findNetworkClientIdByChainId, end } =
        createMockedHandler();
      findNetworkClientIdByChainId.mockReturnValue(undefined);

      await handler(request);
      expect(end).toHaveBeenCalledWith(rpcErrors.internal());
    });

    it('sets the networkClientId and unwraps the CAIP-27 request', async () => {
      const request = createMockedRequest();
      const { handler, next } = createMockedHandler();

      await handler(request);
      expect(request).toStrictEqual({
        jsonrpc: '2.0' as const,
        id: 0,
        scope: 'eip155:1',
        origin: 'http://test.com',
        networkClientId: 'mainnet',
        method: 'eth_call',
        params: {
          foo: 'bar',
        },
      });
      expect(next).toHaveBeenCalled();
    });
  });

  describe('wallet scope', () => {
    it('gets the networkClientId for the globally selected network', async () => {
      const request = createMockedRequest();
      const { handler, getSelectedNetworkClientId } = createMockedHandler();

      await handler({
        ...request,
        params: {
          ...request.params,
          scope: 'wallet',
          request: {
            ...request.params.request,
            method: 'wallet_watchAsset',
          },
        },
      });
      expect(getSelectedNetworkClientId).toHaveBeenCalled();
    });

    it('throws an internal error if a networkClientId cannot be retrieved for the globally selected network', async () => {
      const request = createMockedRequest();
      const { handler, getSelectedNetworkClientId, end } =
        createMockedHandler();
      getSelectedNetworkClientId.mockReturnValue(undefined);

      await handler({
        ...request,
        params: {
          ...request.params,
          scope: 'wallet',
          request: {
            ...request.params.request,
            method: 'wallet_watchAsset',
          },
        },
      });
      expect(end).toHaveBeenCalledWith(rpcErrors.internal());
    });

    it('sets the networkClientId and unwraps the CAIP-27 request', async () => {
      const request = createMockedRequest();
      const { handler, next } = createMockedHandler();

      const walletRequest = {
        ...request,
        params: {
          ...request.params,
          scope: 'wallet',
          request: {
            ...request.params.request,
            method: 'wallet_watchAsset',
          },
        },
      };
      await handler(walletRequest);
      expect(walletRequest).toStrictEqual({
        jsonrpc: '2.0' as const,
        id: 0,
        scope: 'wallet',
        origin: 'http://test.com',
        networkClientId: 'selectedNetworkClientId',
        method: 'wallet_watchAsset',
        params: {
          foo: 'bar',
        },
      });
      expect(next).toHaveBeenCalled();
    });
  });

  describe("'wallet:eip155' scope", () => {
    it('gets the networkClientId for the globally selected network', async () => {
      const request = createMockedRequest();
      const { handler, getSelectedNetworkClientId } = createMockedHandler();

      await handler({
        ...request,
        params: {
          ...request.params,
          scope: 'wallet:eip155',
          request: {
            ...request.params.request,
            method: 'wallet_watchAsset',
          },
        },
      });
      expect(getSelectedNetworkClientId).toHaveBeenCalled();
    });

    it('throws an internal error if a networkClientId cannot be retrieved for the globally selected network', async () => {
      const request = createMockedRequest();
      const { handler, getSelectedNetworkClientId, end } =
        createMockedHandler();
      getSelectedNetworkClientId.mockReturnValue(undefined);

      await handler({
        ...request,
        params: {
          ...request.params,
          scope: 'wallet:eip155',
          request: {
            ...request.params.request,
            method: 'wallet_watchAsset',
          },
        },
      });
      expect(end).toHaveBeenCalledWith(rpcErrors.internal());
    });

    it('sets the networkClientId and unwraps the CAIP-27 request', async () => {
      const request = createMockedRequest();
      const { handler, next } = createMockedHandler();

      const walletRequest = {
        ...request,
        params: {
          ...request.params,
          scope: 'wallet:eip155',
          request: {
            ...request.params.request,
            method: 'wallet_watchAsset',
          },
        },
      };
      await handler(walletRequest);
      expect(walletRequest).toStrictEqual({
        jsonrpc: '2.0' as const,
        id: 0,
        scope: 'wallet:eip155',
        origin: 'http://test.com',
        networkClientId: 'selectedNetworkClientId',
        method: 'wallet_watchAsset',
        params: {
          foo: 'bar',
        },
      });
      expect(next).toHaveBeenCalled();
    });
  });

  describe('non-evm scope', () => {
    it('forwards the unwrapped CAIP-27 request for authorized non-evm scopes to handleNonEvmRequestForOrigin', async () => {
      const request = createMockedRequest();
      const { handler, handleNonEvmRequestForOrigin } = createMockedHandler();

      await handler({
        ...request,
        params: {
          ...request.params,
          scope: 'nonevm:scope',
          request: {
            ...request.params.request,
            method: 'foobar',
          },
        },
      });

      expect(handleNonEvmRequestForOrigin).toHaveBeenCalledWith({
        connectedAddresses: ['nonevm:scope:0x1'],
        scope: 'nonevm:scope',
        request: {
          id: 0,
          jsonrpc: '2.0',
          method: 'foobar',
          origin: 'http://test.com',
          params: {
            foo: 'bar',
          },
          scope: 'nonevm:scope',
        },
      });
    });

    it('sets response.result to the return value from handleNonEvmRequestForOrigin', async () => {
      const request = createMockedRequest();
      const { handler, handleNonEvmRequestForOrigin, end, response } =
        createMockedHandler();
      handleNonEvmRequestForOrigin.mockResolvedValue('nonEvmResult');
      await handler({
        ...request,
        params: {
          ...request.params,
          scope: 'nonevm:scope',
          request: {
            ...request.params.request,
            method: 'foobar',
          },
        },
      });

      expect(response).toStrictEqual({
        jsonrpc: '2.0',
        id: 1,
        result: 'nonEvmResult',
      });
      expect(end).toHaveBeenCalledWith();
    });

    it('returns an error if handleNonEvmRequestForOrigin throws', async () => {
      const request = createMockedRequest();
      const { handler, handleNonEvmRequestForOrigin, end } =
        createMockedHandler();
      handleNonEvmRequestForOrigin.mockRejectedValue(
        new Error('handleNonEvemRequest failed'),
      );
      await handler({
        ...request,
        params: {
          ...request.params,
          scope: 'nonevm:scope',
          request: {
            ...request.params.request,
            method: 'foobar',
          },
        },
      });

      expect(end).toHaveBeenCalledWith(
        new Error('handleNonEvemRequest failed'),
      );
    });
  });
});
