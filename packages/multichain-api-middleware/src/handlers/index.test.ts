import { createMethodMiddleware } from '@metamask/json-rpc-engine';

import { methodHandlers } from './index.js';
import type { WalletCreateSessionHooks } from './wallet-createSession.js';
import type { WalletGetSessionHooks } from './wallet-getSession.js';
import type { WalletInvokeMethodHooks } from './wallet-invokeMethod.js';
import type { WalletRevokeSessionHooks } from './wallet-revokeSession.js';

type Hooks = WalletCreateSessionHooks &
  WalletGetSessionHooks &
  WalletInvokeMethodHooks &
  WalletRevokeSessionHooks;

/* eslint-disable @typescript-eslint/explicit-function-return-type */
const makeMockHooks = () =>
  ({
    listAccounts: () => [
      {
        type: 'eip155:eoa',
        address: '0x123',
        id: '1',
        options: {},
        scopes: [],
        methods: [],
        metadata: {
          name: 'Account 1',
          importTime: Date.now(),
          keyring: { type: 'HD Key Tree' },
        },
      },
    ],
    findNetworkClientIdByChainId: (() =>
      '1') as Hooks['findNetworkClientIdByChainId'],
    requestPermissionsForOrigin: () =>
      Promise.resolve([{}, { id: '1', origin: 'test' }]),
    getNonEvmSupportedMethods: () => [],
    isNonEvmScopeSupported: () => false,
    getNonEvmAccountAddresses: () => [],
    sortAccountIdsByLastSelected: () => [],
    getCapabilities: () => Promise.resolve({}),
    getCaveatForOrigin: (() => ({}) as unknown) as Hooks['getCaveatForOrigin'],
    getSelectedNetworkClientId: () => 'mainnet',
    handleNonEvmRequestForOrigin: () => Promise.resolve(null),
    revokePermissionForOrigin: () => undefined,
    updateCaveat: () => undefined,
    trackSessionCreatedEvent: null,
  }) satisfies Hooks;
/* eslint-enable @typescript-eslint/explicit-function-return-type */

describe('methodHandlers', () => {
  it('constructs a method middleware from the handlers', () => {
    const middleware = createMethodMiddleware({
      handlers: methodHandlers,
      hooks: makeMockHooks(),
    });
    expect(middleware).toBeDefined();
  });
});
