import {
  Caip25CaveatType,
  Caip25EndowmentPermissionName,
} from '@metamask/chain-agnostic-permission';
import {
  PermissionDoesNotExistError,
  UnrecognizedSubjectError,
} from '@metamask/permission-controller';
import { rpcErrors } from '@metamask/rpc-errors';
import type { JsonRpcRequest } from '@metamask/utils';

import { walletRevokeSession } from './wallet-revokeSession';

const baseRequest: JsonRpcRequest & {
  origin: string;
  params: { scopes?: string[] };
} = {
  origin: 'http://test.com',
  params: {},
  jsonrpc: '2.0' as const,
  id: 1,
  method: 'wallet_revokeSession',
};

const createMockedHandler = () => {
  const next = jest.fn();
  const end = jest.fn();
  const revokePermissionForOrigin = jest.fn();
  const updateCaveat = jest.fn();
  const getCaveatForOrigin = jest.fn();
  const response = {
    result: true,
    id: 1,
    jsonrpc: '2.0' as const,
  };
  const handler = (
    request: JsonRpcRequest & {
      origin: string;
      params: { scopes?: string[] };
    },
  ) =>
    walletRevokeSession.implementation(request, response, next, end, {
      revokePermissionForOrigin,
      updateCaveat,
      getCaveatForOrigin,
    });

  return {
    next,
    response,
    end,
    revokePermissionForOrigin,
    updateCaveat,
    getCaveatForOrigin,
    handler,
  };
};

describe('wallet_revokeSession', () => {
  it('revokes the CAIP-25 endowment permission', async () => {
    const { handler, revokePermissionForOrigin } = createMockedHandler();

    await handler(baseRequest);
    expect(revokePermissionForOrigin).toHaveBeenCalledWith(
      Caip25EndowmentPermissionName,
    );
  });

  it('revokes the CAIP-25 endowment permission when params is not specified', async () => {
    const { handler, revokePermissionForOrigin, response } =
      createMockedHandler();
    const requestWithoutParams = {
      origin: 'http://test.com',
      jsonrpc: '2.0' as const,
      id: 1,
      method: 'wallet_revokeSession',
    } as JsonRpcRequest & {
      origin: string;
      params: { scopes?: string[] };
    };

    await handler(requestWithoutParams);
    expect(revokePermissionForOrigin).toHaveBeenCalledWith(
      Caip25EndowmentPermissionName,
    );
    expect(response.result).toBe(true);
  });

  it('partially revokes the CAIP-25 endowment permission if `scopes` param is passed in', async () => {
    const { handler, getCaveatForOrigin, updateCaveat } = createMockedHandler();
    getCaveatForOrigin.mockImplementation(() => ({
      value: {
        optionalScopes: {
          'eip155:1': {
            accounts: ['eip155:1:0xdeadbeef'],
          },
          'eip155:5': {
            accounts: ['eip155:5:0xdeadbeef'],
          },
          'eip155:10': {
            accounts: ['eip155:10:0xdeadbeef'],
          },
        },
        requiredScopes: {},
      },
    }));

    await handler({ ...baseRequest, params: { scopes: ['eip155:1'] } });
    expect(updateCaveat).toHaveBeenCalledWith(
      Caip25EndowmentPermissionName,
      Caip25CaveatType,
      {
        optionalScopes: {
          'eip155:5': { accounts: ['eip155:5:0xdeadbeef'] },
          'eip155:10': { accounts: ['eip155:10:0xdeadbeef'] },
        },
        requiredScopes: {},
      },
    );
  });

  it('not call `updateCaveat` if `scopes` param is passed in with non existing permitted scope', async () => {
    const { handler, getCaveatForOrigin, updateCaveat } = createMockedHandler();
    getCaveatForOrigin.mockImplementation(() => ({
      value: {
        optionalScopes: {
          'eip155:1': {
            accounts: [],
          },
        },
        requiredScopes: {},
      },
    }));

    await handler({ ...baseRequest, params: { scopes: ['eip155:5'] } });
    expect(updateCaveat).not.toHaveBeenCalled();
  });

  it('fully revokes permission when all accounts are removed after scope removal', async () => {
    const {
      handler,
      getCaveatForOrigin,
      updateCaveat,
      revokePermissionForOrigin,
    } = createMockedHandler();
    getCaveatForOrigin.mockImplementation(() => ({
      value: {
        optionalScopes: {
          'eip155:1': {
            accounts: ['eip155:1:0xdeadbeef'],
          },
          'eip155:5': {
            accounts: ['eip155:5:0xdeadbeef'],
          },
        },
        requiredScopes: {},
      },
    }));

    await handler({
      ...baseRequest,
      params: { scopes: ['eip155:1', 'eip155:5'] },
    });
    expect(updateCaveat).not.toHaveBeenCalled();
    expect(revokePermissionForOrigin).toHaveBeenCalledWith(
      Caip25EndowmentPermissionName,
    );
  });

  it('returns true if the CAIP-25 endowment permission does not exist', async () => {
    const { handler, response, revokePermissionForOrigin } =
      createMockedHandler();
    revokePermissionForOrigin.mockImplementation(() => {
      throw new PermissionDoesNotExistError(
        'foo.com',
        Caip25EndowmentPermissionName,
      );
    });

    await handler(baseRequest);
    expect(response.result).toBe(true);
  });

  it('returns true if the subject does not exist', async () => {
    const { handler, response, revokePermissionForOrigin } =
      createMockedHandler();
    revokePermissionForOrigin.mockImplementation(() => {
      throw new UnrecognizedSubjectError('foo.com');
    });

    await handler(baseRequest);
    expect(response.result).toBe(true);
  });

  it('throws an internal RPC error if something unexpected goes wrong with revoking the permission', async () => {
    const { handler, revokePermissionForOrigin, end } = createMockedHandler();
    revokePermissionForOrigin.mockImplementation(() => {
      throw new Error('revoke failed');
    });

    await handler(baseRequest);
    expect(end).toHaveBeenCalledWith(rpcErrors.internal());
  });

  it('throws an internal RPC error if a non-error is thrown', async () => {
    const { handler, revokePermissionForOrigin, end } = createMockedHandler();
    revokePermissionForOrigin.mockImplementation(() => {
      // eslint-disable-next-line @typescript-eslint/only-throw-error
      throw 'revoke failed';
    });

    await handler(baseRequest);
    expect(end).toHaveBeenCalledWith(rpcErrors.internal());
  });

  it('returns true if the permission was revoked', async () => {
    const { handler, response } = createMockedHandler();

    await handler(baseRequest);
    expect(response.result).toBe(true);
  });
});
