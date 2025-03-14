import * as chainAgnosticPermissionModule from '@metamask/chain-agnostic-permission';
import type {
  Json,
  JsonRpcRequest,
  PendingJsonRpcResponse,
} from '@metamask/utils';

import { getPermissionsHandler } from './wallet-getPermissions';

jest.mock('@metamask/chain-agnostic-permission', () => ({
  ...jest.requireActual('@metamask/chain-agnostic-permission'),
  __esModule: true,
}));

const {
  Caip25CaveatType,
  Caip25EndowmentPermissionName,
  CaveatTypes,
  EndowmentTypes,
  RestrictedMethods,
} = chainAgnosticPermissionModule;

const baseRequest = {
  jsonrpc: '2.0' as const,
  id: 0,
  method: 'wallet_getPermissions',
};

const createMockedHandler = () => {
  const next = jest.fn();
  const end = jest.fn();
  const getPermissionsForOrigin = jest.fn().mockReturnValue(
    Object.freeze({
      [Caip25EndowmentPermissionName]: {
        id: '1',
        parentCapability: Caip25EndowmentPermissionName,
        caveats: [
          {
            type: Caip25CaveatType,
            value: {
              requiredScopes: {
                'eip155:1': {
                  accounts: ['eip155:1:0x1', 'eip155:1:0x2'],
                },
                'eip155:5': {
                  accounts: ['eip155:5:0x1', 'eip155:5:0x3'],
                },
              },
              optionalScopes: {
                'eip155:1': {
                  accounts: ['eip155:1:0xdeadbeef'],
                },
              },
            },
          },
        ],
      },
      otherPermission: {
        id: '2',
        parentCapability: 'otherPermission',
        caveats: [
          {
            value: {
              foo: 'bar',
            },
          },
        ],
      },
    }),
  );
  const getAccounts = jest.fn().mockReturnValue([]);
  const response: PendingJsonRpcResponse<Json> = {
    jsonrpc: '2.0' as const,
    id: 0,
  };
  const handler = (request: JsonRpcRequest<Json[]>) =>
    getPermissionsHandler.implementation(request, response, next, end, {
      getPermissionsForOrigin,
      getAccounts,
    });

  return {
    response,
    next,
    end,
    getPermissionsForOrigin,
    getAccounts,
    handler,
  };
};

describe('getPermissionsHandler', () => {
  beforeEach(() => {
    jest
      .spyOn(chainAgnosticPermissionModule, 'getPermittedEthChainIds')
      .mockReturnValue([]);
  });

  it('gets the permissions for the origin', async () => {
    const { handler, getPermissionsForOrigin } = createMockedHandler();

    await handler(baseRequest);
    expect(getPermissionsForOrigin).toHaveBeenCalled();
  });

  it('returns permissions unmodified if no CAIP-25 endowment permission has been granted', async () => {
    const { handler, getPermissionsForOrigin, response } =
      createMockedHandler();

    getPermissionsForOrigin.mockReturnValue(
      Object.freeze({
        otherPermission: {
          id: '1',
          parentCapability: 'otherPermission',
          caveats: [
            {
              value: {
                foo: 'bar',
              },
            },
          ],
        },
      }),
    );

    await handler(baseRequest);
    expect(response.result).toStrictEqual([
      {
        id: '1',
        parentCapability: 'otherPermission',
        caveats: [
          {
            value: {
              foo: 'bar',
            },
          },
        ],
      },
    ]);
  });

  describe('CAIP-25 endowment permissions has been granted', () => {
    it('returns the permissions with the CAIP-25 permission removed', async () => {
      const { handler, getAccounts, getPermissionsForOrigin, response } =
        createMockedHandler();
      getPermissionsForOrigin.mockReturnValue(
        Object.freeze({
          [Caip25EndowmentPermissionName]: {
            id: '1',
            parentCapability: Caip25EndowmentPermissionName,
            caveats: [
              {
                type: Caip25CaveatType,
                value: {
                  requiredScopes: {},
                  optionalScopes: {},
                },
              },
            ],
          },
          otherPermission: {
            id: '2',
            parentCapability: 'otherPermission',
            caveats: [
              {
                value: {
                  foo: 'bar',
                },
              },
            ],
          },
        }),
      );
      getAccounts.mockReturnValue([]);
      jest
        .spyOn(chainAgnosticPermissionModule, 'getPermittedEthChainIds')
        .mockReturnValue([]);

      await handler(baseRequest);
      expect(response.result).toStrictEqual([
        {
          id: '2',
          parentCapability: 'otherPermission',
          caveats: [
            {
              value: {
                foo: 'bar',
              },
            },
          ],
        },
      ]);
    });

    it('gets the lastSelected sorted permitted eth accounts for the origin', async () => {
      const { handler, getAccounts } = createMockedHandler();
      await handler(baseRequest);
      expect(getAccounts).toHaveBeenCalledWith({ ignoreLock: true });
    });

    it('returns the permissions with an eth_accounts permission if some eth accounts are permitted', async () => {
      const { handler, getAccounts, response } = createMockedHandler();
      getAccounts.mockReturnValue(['0x1', '0x2', '0x3', '0xdeadbeef']);

      await handler(baseRequest);
      expect(response.result).toStrictEqual([
        {
          id: '2',
          parentCapability: 'otherPermission',
          caveats: [
            {
              value: {
                foo: 'bar',
              },
            },
          ],
        },
        {
          id: '1',
          parentCapability: RestrictedMethods.EthAccounts,
          caveats: [
            {
              type: CaveatTypes.RestrictReturnedAccounts,
              value: ['0x1', '0x2', '0x3', '0xdeadbeef'],
            },
          ],
        },
      ]);
    });

    it('gets the permitted eip155 chainIds from the CAIP-25 caveat value', async () => {
      const { handler, getPermissionsForOrigin } = createMockedHandler();
      getPermissionsForOrigin.mockReturnValue(
        Object.freeze({
          [Caip25EndowmentPermissionName]: {
            id: '1',
            parentCapability: Caip25EndowmentPermissionName,
            caveats: [
              {
                type: Caip25CaveatType,
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
                  },
                },
              },
            ],
          },
          otherPermission: {
            id: '2',
            parentCapability: 'otherPermission',
            caveats: [
              {
                value: {
                  foo: 'bar',
                },
              },
            ],
          },
        }),
      );
      await handler(baseRequest);
      expect(
        chainAgnosticPermissionModule.getPermittedEthChainIds,
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
        },
      });
    });

    it('returns the permissions with a permittedChains permission if some eip155 chainIds are permitted', async () => {
      const { handler, response } = createMockedHandler();
      jest
        .spyOn(chainAgnosticPermissionModule, 'getPermittedEthChainIds')
        .mockReturnValue(['0x1', '0x64']);

      await handler(baseRequest);
      expect(response.result).toStrictEqual([
        {
          id: '2',
          parentCapability: 'otherPermission',
          caveats: [
            {
              value: {
                foo: 'bar',
              },
            },
          ],
        },
        {
          id: '1',
          parentCapability: EndowmentTypes.PermittedChains,
          caveats: [
            {
              type: CaveatTypes.RestrictNetworkSwitching,
              value: ['0x1', '0x64'],
            },
          ],
        },
      ]);
    });

    it('returns the permissions with a eth_accounts and permittedChains permission if some eip155 accounts and chainIds are permitted', async () => {
      const { handler, getAccounts, response } = createMockedHandler();
      getAccounts.mockReturnValue(['0x1', '0x2', '0xdeadbeef']);
      jest
        .spyOn(chainAgnosticPermissionModule, 'getPermittedEthChainIds')
        .mockReturnValue(['0x1', '0x64']);

      await handler(baseRequest);
      expect(response.result).toStrictEqual([
        {
          id: '2',
          parentCapability: 'otherPermission',
          caveats: [
            {
              value: {
                foo: 'bar',
              },
            },
          ],
        },
        {
          id: '1',
          parentCapability: RestrictedMethods.EthAccounts,
          caveats: [
            {
              type: CaveatTypes.RestrictReturnedAccounts,
              value: ['0x1', '0x2', '0xdeadbeef'],
            },
          ],
        },
        {
          id: '1',
          parentCapability: EndowmentTypes.PermittedChains,
          caveats: [
            {
              type: CaveatTypes.RestrictNetworkSwitching,
              value: ['0x1', '0x64'],
            },
          ],
        },
      ]);
    });
  });
});
