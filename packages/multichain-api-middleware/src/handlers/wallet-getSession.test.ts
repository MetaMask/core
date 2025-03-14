import * as chainAgnosticPermissionModule from '@metamask/chain-agnostic-permission';
import type { JsonRpcRequest } from '@metamask/utils';

import { walletGetSession } from './wallet-getSession';

jest.mock('@metamask/chain-agnostic-permission', () => ({
  ...jest.requireActual('@metamask/chain-agnostic-permission'),
  __esModule: true,
}));

const { Caip25CaveatType, Caip25EndowmentPermissionName } =
  chainAgnosticPermissionModule;

const baseRequest: JsonRpcRequest & { origin: string } = {
  origin: 'http://test.com',
  jsonrpc: '2.0' as const,
  method: 'wallet_getSession',
  params: {},
  id: 1,
};

const createMockedHandler = () => {
  const next = jest.fn();
  const end = jest.fn();
  const getNonEvmSupportedMethods = jest.fn();
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
    },
  });
  const response = {
    result: {
      sessionScopes: {},
    },
    id: 1,
    jsonrpc: '2.0' as const,
  };
  const handler = (request: JsonRpcRequest & { origin: string }) =>
    walletGetSession.implementation(request, response, next, end, {
      getCaveatForOrigin,
      getNonEvmSupportedMethods,
    });

  return {
    next,
    response,
    end,
    getCaveatForOrigin,
    getNonEvmSupportedMethods,
    handler,
  };
};

describe('wallet_getSession', () => {
  beforeEach(() => {
    jest
      .spyOn(chainAgnosticPermissionModule, 'getSessionScopes')
      .mockReturnValue({});
  });

  it('gets the authorized scopes from the CAIP-25 endowment permission', async () => {
    const { handler, getCaveatForOrigin } = createMockedHandler();

    await handler(baseRequest);
    expect(getCaveatForOrigin).toHaveBeenCalledWith(
      Caip25EndowmentPermissionName,
      Caip25CaveatType,
    );
  });

  it('returns empty scopes if the CAIP-25 endowment permission does not exist', async () => {
    const { handler, response, getCaveatForOrigin } = createMockedHandler();
    getCaveatForOrigin.mockImplementation(() => {
      throw new Error('permission not found');
    });

    await handler(baseRequest);
    expect(response.result).toStrictEqual({
      sessionScopes: {},
    });
  });

  it('gets the session scopes from the CAIP-25 caveat value', async () => {
    const { handler, getNonEvmSupportedMethods } = createMockedHandler();

    await handler(baseRequest);
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
      },
      {
        getNonEvmSupportedMethods,
      },
    );
  });

  it('returns the session scopes', async () => {
    const { handler, response } = createMockedHandler();

    jest
      .spyOn(chainAgnosticPermissionModule, 'getSessionScopes')
      .mockReturnValue({
        'eip155:1': {
          methods: ['eth_call', 'net_version'],
          notifications: ['chainChanged'],
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
      });

    await handler(baseRequest);
    expect(response.result).toStrictEqual({
      sessionScopes: {
        'eip155:1': {
          methods: ['eth_call', 'net_version'],
          notifications: ['chainChanged'],
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
      },
    });
  });
});
