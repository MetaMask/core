import { providerErrors, rpcErrors } from '@metamask/rpc-errors';
import type { JsonRpcRequest } from '@metamask/utils';

import * as PermissionAdapterSessionScopes from '../adapters/caip-permission-adapter-session-scopes';
import {
  Caip25CaveatType,
  Caip25EndowmentPermissionName,
} from '../caip25Permission';
import { walletInvokeMethod } from './wallet-invokeMethod';

jest.mock('../adapters/caip-permission-adapter-session-scopes', () => ({
  getSessionScopes: jest.fn(),
}));
const MockPermissionAdapterSessionScopes = jest.mocked(
  PermissionAdapterSessionScopes,
);

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
  const getCaveat = jest.fn().mockReturnValue({
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
  const handler = (request: JsonRpcRequest & { origin: string }) =>
    walletInvokeMethod.implementation(
      request,
      { jsonrpc: '2.0', id: 1 },
      next,
      end,
      {
        getCaveat,
        findNetworkClientIdByChainId,
        getSelectedNetworkClientId,
      },
    );

  return {
    next,
    end,
    getCaveat,
    findNetworkClientIdByChainId,
    getSelectedNetworkClientId,
    handler,
  };
};

describe('wallet_invokeMethod', () => {
  beforeEach(() => {
    MockPermissionAdapterSessionScopes.getSessionScopes.mockReturnValue({
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
      'unknown:scope': {
        methods: ['foobar'],
        notifications: [],
        accounts: [],
      },
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('gets the authorized scopes from the CAIP-25 endowment permission', async () => {
    const request = createMockedRequest();
    const { handler, getCaveat } = createMockedHandler();
    await handler(request);
    expect(getCaveat).toHaveBeenCalledWith(
      'http://test.com',
      Caip25EndowmentPermissionName,
      Caip25CaveatType,
    );
  });

  it('gets the session scopes from the CAIP-25 caveat value', async () => {
    const request = createMockedRequest();
    const { handler } = createMockedHandler();
    await handler(request);
    expect(
      MockPermissionAdapterSessionScopes.getSessionScopes,
    ).toHaveBeenCalledWith({
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
    });
  });

  it('throws an unauthorized error when there is no CAIP-25 endowment permission', async () => {
    const request = createMockedRequest();
    const { handler, getCaveat, end } = createMockedHandler();
    getCaveat.mockImplementation(() => {
      throw new Error('permission not found');
    });
    await handler(request);
    expect(end).toHaveBeenCalledWith(providerErrors.unauthorized());
  });

  it('throws an unauthorized error when the CAIP-25 endowment permission was not granted from the multichain flow', async () => {
    const request = createMockedRequest();
    const { handler, getCaveat, end } = createMockedHandler();
    getCaveat.mockReturnValue({
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

  it('throws an internal error for authorized but unsupported scopes', async () => {
    const request = createMockedRequest();
    const { handler, end } = createMockedHandler();

    await handler({
      ...request,
      params: {
        ...request.params,
        scope: 'unknown:scope',
        request: {
          ...request.params.request,
          method: 'foobar',
        },
      },
    });

    expect(end).toHaveBeenCalledWith(rpcErrors.internal());
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
});
