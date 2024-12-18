import type { JsonRpcRequest } from '@metamask/utils';

import * as PermissionAdapterSessionScopes from '../adapters/caip-permission-adapter-session-scopes';
import {
  Caip25CaveatType,
  Caip25EndowmentPermissionName,
} from '../caip25Permission';
import { walletGetSession } from './wallet-getSession';

jest.mock('../adapters/caip-permission-adapter-session-scopes', () => ({
  getSessionScopes: jest.fn(),
}));
const MockPermissionAdapterSessionScopes = jest.mocked(
  PermissionAdapterSessionScopes,
);

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

  it('gets the session scopes from the CAIP-25 caveat value', async () => {
    const { handler } = createMockedHandler();

    await handler(baseRequest);
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
    });
  });

  it('returns the session scopes', async () => {
    const { handler, response } = createMockedHandler();

    MockPermissionAdapterSessionScopes.getSessionScopes.mockReturnValue({
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
