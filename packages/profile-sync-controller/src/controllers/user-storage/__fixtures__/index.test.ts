import * as allExports from '.';

describe('@metamask/profile-sync-controller/user-storage/mocks', () => {
  it('has expected JavaScript exports', () => {
    expect(Object.keys(allExports)).toMatchInlineSnapshot(`
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
