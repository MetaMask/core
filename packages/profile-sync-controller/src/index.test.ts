import * as allExports from '.';

describe('@metamask/profile-sync-controller', () => {
  it('has expected JavaScript exports', () => {
    expect(Object.keys(allExports)).toMatchInlineSnapshot(`
      Array [
        "SDK",
        "AuthenticationController",
        "UserStorageController",
      ]
    `);

    expect(Object.keys(allExports.SDK)).toMatchInlineSnapshot(`
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

    expect(Object.keys(allExports.AuthenticationController))
      .toMatchInlineSnapshot(`
      Array [
        "Controller",
        "Mocks",
        "default",
        "defaultState",
      ]
    `);

    expect(Object.keys(allExports.AuthenticationController.Mocks))
      .toMatchInlineSnapshot(`
      Array [
        "MOCK_NONCE",
        "MOCK_NONCE_RESPONSE",
        "getMockAuthNonceResponse",
        "MOCK_JWT",
        "MOCK_LOGIN_RESPONSE",
        "getMockAuthLoginResponse",
        "MOCK_ACCESS_TOKEN",
        "MOCK_OATH_TOKEN_RESPONSE",
        "getMockAuthAccessTokenResponse",
      ]
    `);

    expect(Object.keys(allExports.UserStorageController))
      .toMatchInlineSnapshot(`
      Array [
        "Controller",
        "Mocks",
        "default",
        "defaultState",
        "Encryption",
        "createSHA256Hash",
        "USER_STORAGE_FEATURE_NAMES",
        "USER_STORAGE_SCHEMA",
        "getFeatureAndKeyFromPath",
        "isPathWithFeatureAndKey",
        "createEntryPath",
      ]
    `);

    expect(Object.keys(allExports.UserStorageController.Mocks))
      .toMatchInlineSnapshot(`
      Array [
        "getMockUserStorageEndpoint",
        "createMockGetStorageResponse",
        "createMockAllFeatureEntriesResponse",
        "getMockUserStorageGetResponse",
        "getMockUserStorageAllFeatureEntriesResponse",
        "getMockUserStoragePutResponse",
        "getMockUserStorageBatchPutResponse",
        "getMockUserStorageBatchDeleteResponse",
        "deleteMockUserStorageResponse",
        "deleteMockUserStorageAllFeatureEntriesResponse",
        "MOCK_STORAGE_KEY_SIGNATURE",
        "MOCK_STORAGE_KEY",
        "MOCK_STORAGE_DATA",
        "MOCK_ENCRYPTED_STORAGE_DATA",
      ]
    `);
  });
});
