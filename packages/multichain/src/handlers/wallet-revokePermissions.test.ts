import { invalidParams } from '@metamask/permission-controller';
import type {
  Json,
  JsonRpcRequest,
  PendingJsonRpcResponse,
} from '@metamask/utils';

import { revokePermissionsHandler } from './wallet-revokePermissions';
import { Caip25EndowmentPermissionName } from '../caip25Permission';
import { EndowmentTypes, RestrictedMethods } from '../constants/permissions';

const baseRequest = {
  jsonrpc: '2.0' as const,
  id: 0,
  method: 'wallet_revokePermissions',
  params: [
    {
      [Caip25EndowmentPermissionName]: {},
      otherPermission: {},
    },
  ],
};

const createMockedHandler = () => {
  const next = jest.fn();
  const end = jest.fn();
  const revokePermissionsForOrigin = jest.fn();

  const response: PendingJsonRpcResponse = {
    jsonrpc: '2.0' as const,
    id: 0,
  };
  const handler = (request: JsonRpcRequest<Json[]>) =>
    revokePermissionsHandler.implementation(request, response, next, end, {
      revokePermissionsForOrigin,
    });

  return {
    response,
    next,
    end,
    revokePermissionsForOrigin,
    handler,
  };
};

describe('revokePermissionsHandler', () => {
  it('returns an error if params is malformed', () => {
    const { handler, end } = createMockedHandler();

    const malformedRequest = {
      ...baseRequest,
      params: [],
    };
    handler(malformedRequest);
    expect(end).toHaveBeenCalledWith(
      invalidParams({ data: { request: malformedRequest } }),
    );
  });

  it('returns an error if params are empty', () => {
    const { handler, end } = createMockedHandler();

    const emptyRequest = {
      ...baseRequest,
      params: [{}],
    };
    handler(emptyRequest);
    expect(end).toHaveBeenCalledWith(
      invalidParams({ data: { request: emptyRequest } }),
    );
  });

  it('returns an error if params only contains the CAIP-25 permission', () => {
    const { handler, end } = createMockedHandler();

    const emptyRequest = {
      ...baseRequest,
      params: [
        {
          [Caip25EndowmentPermissionName]: {},
        },
      ],
    };
    handler(emptyRequest);
    expect(end).toHaveBeenCalledWith(
      invalidParams({ data: { request: emptyRequest } }),
    );
  });

  describe.each([
    [RestrictedMethods.EthAccounts],
    [EndowmentTypes.PermittedChains],
  ])('%s permission is specified', (permission: string) => {
    it('revokes the CAIP-25 endowment permission', () => {
      const { handler, revokePermissionsForOrigin } = createMockedHandler();

      handler({
        ...baseRequest,
        params: [
          {
            [permission]: {},
          },
        ],
      });
      expect(revokePermissionsForOrigin).toHaveBeenCalledWith([
        Caip25EndowmentPermissionName,
      ]);
    });

    it('revokes other permissions specified', () => {
      const { handler, revokePermissionsForOrigin } = createMockedHandler();

      handler({
        ...baseRequest,
        params: [
          {
            [permission]: {},
            otherPermission: {},
          },
        ],
      });
      expect(revokePermissionsForOrigin).toHaveBeenCalledWith([
        'otherPermission',
        Caip25EndowmentPermissionName,
      ]);
    });
  });

  it('revokes permissions other than eth_accounts, permittedChains, CAIP-25 if specified', () => {
    const { handler, revokePermissionsForOrigin } = createMockedHandler();

    handler({
      ...baseRequest,
      params: [
        {
          [Caip25EndowmentPermissionName]: {},
          otherPermission: {},
        },
      ],
    });
    expect(revokePermissionsForOrigin).toHaveBeenCalledWith([
      'otherPermission',
    ]);
  });

  it('returns null', () => {
    const { handler, response } = createMockedHandler();

    handler(baseRequest);
    expect(response.result).toBeNull();
  });
});
