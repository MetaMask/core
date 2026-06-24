import * as allExports from '.';

describe('@metamask/profile-sync-controller/sdk', () => {
  it('has expected JavaScript exports', () => {
    expect(Object.keys(allExports)).toMatchInlineSnapshot(`
      Array [
        "JwtBearerAuth",
        "SIWEJwtBearerAuth",
        "SRPJwtBearerAuth",
        "AuthType",
        "STORAGE_URL",
        "UserStorage",
        "NonceRetrievalError",
        "SignInError",
        "PairError",
        "UserStorageError",
        "ValidationError",
        "UnsupportedAuthTypeError",
        "NotFoundError",
        "SNAP_ORIGIN",
        "connectSnap",
        "getSnaps",
        "isSnapConnected",
        "MESSAGE_SIGNING_SNAP",
        "Encryption",
        "createSHA256Hash",
        "Env",
        "Platform",
        "getEnvUrls",
        "getOidcClientId",
        "USER_STORAGE_FEATURE_NAMES",
        "USER_STORAGE_SCHEMA",
        "getFeatureAndKeyFromPath",
        "isPathWithFeatureAndKey",
        "createEntryPath",
      ]
    `);
  });
});
