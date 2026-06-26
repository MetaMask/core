import { createMethodMiddleware } from '@metamask/json-rpc-engine';

import * as allExports from '.';
import type { GetPermissionsHooks } from './wallet-getPermissions';
import type { RequestPermissionsHooks } from './wallet-requestPermissions';
import type { RevokePermissionsHooks } from './wallet-revokePermissions';

type Hooks = GetPermissionsHooks &
  RequestPermissionsHooks &
  RevokePermissionsHooks;

/* eslint-disable @typescript-eslint/explicit-function-return-type */
const makeMockHooks = () =>
  ({
    getPermissionsForOrigin: () => ({}),
    getAccounts: () => ['0x123'],
    requestPermissionsForOrigin: () =>
      Promise.resolve([{}, { id: '1', origin: 'test' }]),
    revokePermissionsForOrigin: () => undefined,
    getCaip25PermissionFromLegacyPermissionsForOrigin: () => ({}),
  }) satisfies Hooks;
/* eslint-enable @typescript-eslint/explicit-function-return-type */

describe('@metamask/eip1193-permission-middleware', () => {
  it('has expected JavaScript exports', () => {
    expect(Object.keys(allExports)).toMatchInlineSnapshot(`
      [
        "methodHandlers",
      ]
    `);
  });

  it('constructs a method middleware from the handlers', () => {
    const middleware = createMethodMiddleware({
      handlers: allExports.methodHandlers,
      hooks: makeMockHooks(),
    });
    expect(middleware).toBeDefined();
  });
});
