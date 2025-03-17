import {
  Caip25CaveatType,
  Caip25EndowmentPermissionName,
} from '@metamask/chain-agnostic-permission';
import {
  invalidParams,
  type RequestedPermissions,
} from '@metamask/permission-controller';
import type {
  Json,
  JsonRpcRequest,
  PendingJsonRpcResponse,
} from '@metamask/utils';

import { CaveatTypes, EndowmentTypes, RestrictedMethods } from './types';
import { requestPermissionsHandler } from './wallet-requestPermissions';

const getBaseRequest = (overrides = {}) => ({
  jsonrpc: '2.0' as const,
  id: 0,
  method: 'wallet_requestPermissions',
  networkClientId: 'mainnet',
  origin: 'http://test.com',
  params: [
    {
      eth_accounts: {},
    },
  ],
  ...overrides,
});

const createMockedHandler = () => {
  const next = jest.fn();
  const end = jest.fn();
  const requestPermissionsForOrigin = jest
    .fn()
    .mockResolvedValue([{ [Caip25EndowmentPermissionName]: {} }]);
  const getAccounts = jest.fn().mockReturnValue([]);
  const getCaip25PermissionFromLegacyPermissionsForOrigin = jest
    .fn()
    .mockReturnValue({});

  const response: PendingJsonRpcResponse<Json> = {
    jsonrpc: '2.0' as const,
    id: 0,
  };
  const handler = (request: unknown) =>
    requestPermissionsHandler.implementation(
      request as JsonRpcRequest<[RequestedPermissions]> & { origin: string },
      response,
      next,
      end,
      {
        getAccounts,
        requestPermissionsForOrigin,
        getCaip25PermissionFromLegacyPermissionsForOrigin,
      },
    );

  return {
    response,
    next,
    end,
    getAccounts,
    requestPermissionsForOrigin,
    getCaip25PermissionFromLegacyPermissionsForOrigin,
    handler,
  };
};

describe('requestPermissionsHandler', () => {
  afterEach(() => {
    jest.resetAllMocks();
  });

  it('returns an error if params is malformed', async () => {
    const { handler, end } = createMockedHandler();

    const malformedRequest = getBaseRequest({ params: [] });
    await handler(malformedRequest);
    expect(end).toHaveBeenCalledWith(
      invalidParams({ data: { request: malformedRequest } }),
    );
  });

  describe('only other permissions (non CAIP-25 equivalent) requested', () => {
    it('requests the permission for the other permissions', async () => {
      const { handler, requestPermissionsForOrigin } = createMockedHandler();

      await handler(
        getBaseRequest({
          params: [
            {
              otherPermissionA: {},
              otherPermissionB: {},
            },
          ],
        }),
      );

      expect(requestPermissionsForOrigin).toHaveBeenCalledWith({
        otherPermissionA: {},
        otherPermissionB: {},
      });
    });

    it('returns the other permissions that are granted', async () => {
      const { handler, requestPermissionsForOrigin, response } =
        createMockedHandler();

      requestPermissionsForOrigin.mockResolvedValue([
        {
          otherPermissionA: { foo: 'bar' },
          otherPermissionB: { hello: true },
        },
      ]);

      await handler(
        getBaseRequest({
          params: [
            {
              otherPermissionA: {},
              otherPermissionB: {},
            },
          ],
        }),
      );

      expect(response.result).toStrictEqual([{ foo: 'bar' }, { hello: true }]);
    });
  });

  describe('only CAIP-25 "endowment:caip25" permissions requested', () => {
    it('should call "requestPermissionsForOrigin" hook with empty object', async () => {
      const { handler, requestPermissionsForOrigin } = createMockedHandler();

      await handler(
        getBaseRequest({
          params: [
            {
              [Caip25EndowmentPermissionName]: {
                caveats: [
                  {
                    type: Caip25CaveatType,
                    value: {
                      requiredScopes: {},
                      optionalScopes: {
                        'eip155:5': { accounts: ['eip155:5:0xdead'] },
                      },
                      isMultichainOrigin: false,
                    },
                  },
                ],
              },
            },
          ],
        }),
      );

      expect(requestPermissionsForOrigin).toHaveBeenCalledWith({});
    });
  });

  describe('only CAIP-25 equivalent permissions ("eth_accounts" and/or "endowment:permittedChains") requested', () => {
    it('requests the CAIP-25 permission using eth_accounts when only eth_accounts is specified in params', async () => {
      const mockedRequestedPermissions = {
        [Caip25EndowmentPermissionName]: {
          caveats: [
            {
              type: Caip25CaveatType,
              value: {
                requiredScopes: {},
                optionalScopes: {
                  'wallet:eip155': { accounts: ['wallet:eip155:foo'] },
                },
                isMultichainOrigin: false,
              },
            },
          ],
        },
      };

      const {
        handler,
        getCaip25PermissionFromLegacyPermissionsForOrigin,
        requestPermissionsForOrigin,
        getAccounts,
      } = createMockedHandler();
      getCaip25PermissionFromLegacyPermissionsForOrigin.mockReturnValue(
        mockedRequestedPermissions,
      );
      requestPermissionsForOrigin.mockResolvedValue([
        mockedRequestedPermissions,
      ]);
      getAccounts.mockReturnValue(['foo']);

      await handler(
        getBaseRequest({
          params: [
            {
              [RestrictedMethods.EthAccounts]: {
                foo: 'bar',
              },
            },
          ],
        }),
      );

      expect(
        getCaip25PermissionFromLegacyPermissionsForOrigin,
      ).toHaveBeenCalledWith({
        [RestrictedMethods.EthAccounts]: {
          foo: 'bar',
        },
      });
    });

    it('requests the CAIP-25 permission for permittedChains when only permittedChains is specified in params', async () => {
      const mockedRequestedPermissions = {
        [Caip25EndowmentPermissionName]: {
          caveats: [
            {
              type: Caip25CaveatType,
              value: {
                requiredScopes: {},
                optionalScopes: {
                  'eip155:100': { accounts: [] },
                },
                isMultichainOrigin: false,
              },
            },
          ],
        },
      };

      const {
        handler,
        requestPermissionsForOrigin,
        getCaip25PermissionFromLegacyPermissionsForOrigin,
      } = createMockedHandler();

      getCaip25PermissionFromLegacyPermissionsForOrigin.mockReturnValue(
        mockedRequestedPermissions,
      );
      requestPermissionsForOrigin.mockResolvedValue([
        mockedRequestedPermissions,
      ]);

      await handler(
        getBaseRequest({
          params: [
            {
              [EndowmentTypes.PermittedChains]: {
                caveats: [
                  {
                    type: CaveatTypes.RestrictNetworkSwitching,
                    value: ['0x64'],
                  },
                ],
              },
            },
          ],
        }),
      );

      expect(
        getCaip25PermissionFromLegacyPermissionsForOrigin,
      ).toHaveBeenCalledWith({
        [EndowmentTypes.PermittedChains]: {
          caveats: [
            {
              type: CaveatTypes.RestrictNetworkSwitching,
              value: ['0x64'],
            },
          ],
        },
      });
    });

    it('requests the CAIP-25 permission for eth_accounts and permittedChains when both are specified in params', async () => {
      const mockedRequestedPermissions = {
        [Caip25EndowmentPermissionName]: {
          caveats: [
            {
              type: Caip25CaveatType,
              value: {
                requiredScopes: {},
                optionalScopes: {
                  'eip155:100': { accounts: ['bar'] },
                },
                isMultichainOrigin: false,
              },
            },
          ],
        },
      };

      const {
        handler,
        requestPermissionsForOrigin,
        getAccounts,
        getCaip25PermissionFromLegacyPermissionsForOrigin,
      } = createMockedHandler();

      requestPermissionsForOrigin.mockResolvedValue([
        mockedRequestedPermissions,
      ]);
      getAccounts.mockReturnValue(['bar']);
      getCaip25PermissionFromLegacyPermissionsForOrigin.mockReturnValue(
        mockedRequestedPermissions,
      );

      await handler(
        getBaseRequest({
          params: [
            {
              [RestrictedMethods.EthAccounts]: {
                foo: 'bar',
              },
              [EndowmentTypes.PermittedChains]: {
                caveats: [
                  {
                    type: CaveatTypes.RestrictNetworkSwitching,
                    value: ['0x64'],
                  },
                ],
              },
            },
          ],
        }),
      );

      expect(
        getCaip25PermissionFromLegacyPermissionsForOrigin,
      ).toHaveBeenCalledWith({
        [RestrictedMethods.EthAccounts]: {
          foo: 'bar',
        },
        [EndowmentTypes.PermittedChains]: {
          caveats: [
            {
              type: CaveatTypes.RestrictNetworkSwitching,
              value: ['0x64'],
            },
          ],
        },
      });
    });
  });

  describe('CAIP-25 equivalent permissions ("eth_accounts" and/or "endowment:permittedChains") alongside "endowment:caip25" requested', () => {
    it('requests the CAIP-25 permission only for eth_accounts and permittedChains when both are specified in params (ignores "endowment:caip25")', async () => {
      const mockedRequestedPermissions = {
        [Caip25EndowmentPermissionName]: {
          caveats: [
            {
              type: Caip25CaveatType,
              value: {
                requiredScopes: {},
                optionalScopes: {
                  'eip155:100': { accounts: ['bar'] },
                },
                isMultichainOrigin: false,
              },
            },
          ],
        },
      };

      const {
        handler,
        requestPermissionsForOrigin,
        getAccounts,
        getCaip25PermissionFromLegacyPermissionsForOrigin,
      } = createMockedHandler();

      requestPermissionsForOrigin.mockResolvedValue([
        mockedRequestedPermissions,
      ]);
      getAccounts.mockReturnValue(['bar']);
      getCaip25PermissionFromLegacyPermissionsForOrigin.mockReturnValue(
        mockedRequestedPermissions,
      );

      await handler(
        getBaseRequest({
          params: [
            {
              [Caip25EndowmentPermissionName]: {
                caveats: [
                  {
                    type: Caip25CaveatType,
                    value: {
                      requiredScopes: {},
                      optionalScopes: {
                        'eip155:5': { accounts: ['eip155:5:0xdead'] },
                      },
                      isMultichainOrigin: false,
                    },
                  },
                ],
              },
              [RestrictedMethods.EthAccounts]: {
                foo: 'bar',
              },
              [EndowmentTypes.PermittedChains]: {
                caveats: [
                  {
                    type: CaveatTypes.RestrictNetworkSwitching,
                    value: ['0x64'],
                  },
                ],
              },
            },
          ],
        }),
      );

      expect(
        getCaip25PermissionFromLegacyPermissionsForOrigin,
      ).toHaveBeenCalledWith({
        [RestrictedMethods.EthAccounts]: {
          foo: 'bar',
        },
        [EndowmentTypes.PermittedChains]: {
          caveats: [
            {
              type: CaveatTypes.RestrictNetworkSwitching,
              value: ['0x64'],
            },
          ],
        },
      });
    });
  });

  describe('both CAIP-25 equivalent and other permissions requested', () => {
    describe('both CAIP-25 equivalent permissions and other permissions are approved', () => {
      it('returns eth_accounts, permittedChains, and other permissions that were granted', async () => {
        const mockedRequestedPermissions = {
          otherPermissionA: { foo: 'bar' },
          otherPermissionB: { hello: true },
          [Caip25EndowmentPermissionName]: {
            caveats: [
              {
                type: Caip25CaveatType,
                value: {
                  requiredScopes: {},
                  optionalScopes: {
                    'eip155:1': { accounts: ['eip155:1:0xdeadbeef'] },
                    'eip155:5': { accounts: ['eip155:5:0xdeadbeef'] },
                  },
                  isMultichainOrigin: false,
                },
              },
            ],
          },
        };

        const {
          handler,
          requestPermissionsForOrigin,
          getAccounts,
          getCaip25PermissionFromLegacyPermissionsForOrigin,
          response,
        } = createMockedHandler();

        requestPermissionsForOrigin.mockResolvedValue([
          mockedRequestedPermissions,
        ]);

        getAccounts.mockReturnValue(['0xdeadbeef']);

        getCaip25PermissionFromLegacyPermissionsForOrigin.mockReturnValue(
          mockedRequestedPermissions,
        );

        await handler(
          getBaseRequest({
            params: [
              {
                eth_accounts: {},
                'endowment:permitted-chains': {},
                otherPermissionA: {},
                otherPermissionB: {},
              },
            ],
          }),
        );
        expect(response.result).toStrictEqual([
          { foo: 'bar' },
          { hello: true },
          {
            caveats: [
              {
                type: CaveatTypes.RestrictReturnedAccounts,
                value: ['0xdeadbeef'],
              },
            ],
            parentCapability: RestrictedMethods.EthAccounts,
          },
          {
            caveats: [
              {
                type: CaveatTypes.RestrictNetworkSwitching,
                value: ['0x1', '0x5'],
              },
            ],
            parentCapability: EndowmentTypes.PermittedChains,
          },
        ]);
      });
    });

    describe('CAIP-25 equivalent permissions are approved, but other permissions are not approved', () => {
      it('returns an error that the other permissions were not approved', async () => {
        const { handler, requestPermissionsForOrigin } = createMockedHandler();
        requestPermissionsForOrigin.mockRejectedValue(
          new Error('other permissions rejected'),
        );

        await expect(
          handler(
            getBaseRequest({
              params: [
                {
                  eth_accounts: {},
                  'endowment:permitted-chains': {},
                  otherPermissionA: {},
                  otherPermissionB: {},
                },
              ],
            }),
          ),
        ).rejects.toThrow('other permissions rejected');
      });
    });
  });

  describe('no permissions requested', () => {
    it('returns an error by requesting empty permissions in params from the PermissionController if no permissions specified', async () => {
      const { handler, requestPermissionsForOrigin } = createMockedHandler();
      requestPermissionsForOrigin.mockRejectedValue(
        new Error('failed to request unexpected permission'),
      );

      await expect(
        handler(
          getBaseRequest({
            params: [{}],
          }),
        ),
      ).rejects.toThrow('failed to request unexpected permission');
    });

    it("returns an error if requestPermissionsForOrigin hook doesn't return a valid CAIP-25 permission", async () => {
      const { handler, requestPermissionsForOrigin } = createMockedHandler();
      requestPermissionsForOrigin.mockResolvedValue([{ foo: 'bar' }]);

      await expect(
        handler(
          getBaseRequest({
            params: [{ eth_accounts: {}, 'endowment:permitted-chains': {} }],
          }),
        ),
      ).rejects.toThrow(
        `could not find ${Caip25EndowmentPermissionName} permission.`,
      );
    });

    it('returns an error if requestPermissionsForOrigin hook returns a an invalid CAIP-25 permission (with no CAIP-25 caveat value)', async () => {
      const { handler, requestPermissionsForOrigin } = createMockedHandler();
      requestPermissionsForOrigin.mockResolvedValue([
        {
          [Caip25EndowmentPermissionName]: {
            caveats: [{ type: 'foo', value: 'bar' }],
          },
        },
      ]);

      await expect(
        handler(
          getBaseRequest({
            params: [{ eth_accounts: {}, 'endowment:permitted-chains': {} }],
          }),
        ),
      ).rejects.toThrow(
        `could not find ${Caip25CaveatType} in granted ${Caip25EndowmentPermissionName} permission.`,
      );
    });
  });
});
