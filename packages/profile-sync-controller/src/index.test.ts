import * as allExports from '.';

describe('@metamask/profile-sync-controller', () => {
  it('has expected JavaScript exports', () => {
    expect(Object.keys(allExports)).toMatchInlineSnapshot(`
      Array [
        "SIWEJwtBearerAuth",
        "SRPJwtBearerAuth",
        "JwtBearerAuth",
        "AuthenticationController",
        "UserStorageController",
      ]
    `);
  });
});
