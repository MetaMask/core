import * as allExports from '.';

describe('@metamask/profile-sync-controller/user-storage', () => {
  it('has expected JavaScript exports', () => {
    expect(Object.keys(allExports)).toMatchInlineSnapshot(`
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

    expect(Object.keys(allExports.Mocks)).toMatchInlineSnapshot(`
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
