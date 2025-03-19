import * as allExports from '.';

describe('@metamask/eip1193-permission-middleware', () => {
  it('has expected JavaScript exports', () => {
    expect(Object.keys(allExports)).toMatchInlineSnapshot(`
      Array [
        "getPermissionsHandler",
        "requestPermissionsHandler",
        "revokePermissionsHandler",
      ]
    `);
  });
});
