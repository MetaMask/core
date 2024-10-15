import type { JsonRpcRequest } from '@metamask/utils';

import {
  Caip25CaveatType,
  Caip25EndowmentPermissionName,
} from '../caip25Permission';
import { walletGetSession } from './wallet-getSession';

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
  const getCaveat = jest.fn().mockReturnValue({
    value: {
      requiredScopes: {
        'eip155:1': {
          methods: ['eth_call'],
          notifications: [],
        },
        'eip155:5': {
          methods: ['eth_chainId'],
          notifications: [],
        },
      },
      optionalScopes: {
        'eip155:1': {
          methods: ['net_version'],
          notifications: ['chainChanged'],
        },
        wallet: {
          methods: ['wallet_watchAsset'],
          notifications: [],
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
      getCaveat,
    });

  return {
    next,
    response,
    end,
    getCaveat,
    handler,
  };
};

describe('wallet_getSession', () => {
  it('gets the authorized scopes from the CAIP-25 endowment permission', async () => {
    const { handler, getCaveat } = createMockedHandler();

    await handler(baseRequest);
    expect(getCaveat).toHaveBeenCalledWith(
      'http://test.com',
      Caip25EndowmentPermissionName,
      Caip25CaveatType,
    );
  });

  it('returns empty scopes if the CAIP-25 endowment permission does not exist', async () => {
    const { handler, response, getCaveat } = createMockedHandler();
    getCaveat.mockImplementation(() => {
      throw new Error('permission not found');
    });

    await handler(baseRequest);
    expect(response.result).toStrictEqual({
      sessionScopes: {},
    });
  });

  it('returns the merged scopes', async () => {
    const { handler, response } = createMockedHandler();

    await handler(baseRequest);
    expect(response.result).toStrictEqual({
      sessionScopes: {
        'eip155:1': {
          methods: ['eth_call', 'net_version'],
          notifications: ['chainChanged'],
        },
        'eip155:5': {
          methods: ['eth_chainId'],
          notifications: [],
        },
        wallet: {
          methods: ['wallet_watchAsset'],
          notifications: [],
        },
      },
    });
  });
});
