import * as allExports from '.';

describe('@metamask/permission-log-controller', () => {
  it('has expected JavaScript exports', () => {
    expect(Object.keys(allExports)).toMatchInlineSnapshot(`
    Array [
      "JsonRpcRequestWithOrigin",
      "Caveat",
      "Permission",
      "PermissionActivityLog",
      "PermissionLog",
      "PermissionEntry",
      "PermissionHistory",
      "PermissionLogControllerState",
      "PermissionLogControllerOptions",
      "PermissionLogControllerMessenger",
      "PermissionLogController"
    ]`);
  });
});
