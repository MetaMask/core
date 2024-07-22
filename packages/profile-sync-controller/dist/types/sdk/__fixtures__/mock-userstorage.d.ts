import nock from 'nock';
type MockReply = {
    status: nock.StatusCode;
    body?: nock.Body;
};
export declare const MOCK_STORAGE_KEY = "MOCK_STORAGE_KEY";
export declare const MOCK_NOTIFICATIONS_DATA: {
    is_compact: boolean;
};
export declare const MOCK_NOTIFICATIONS_DATA_ENCRYPTED: string;
export declare const MOCK_STORAGE_RESPONSE: {
    HashedKey: string;
    Data: string;
};
export declare const handleMockUserStorageGet: (mockReply?: MockReply) => nock.Scope;
export declare const handleMockUserStoragePut: (mockReply?: MockReply) => nock.Scope;
export {};
//# sourceMappingURL=mock-userstorage.d.ts.map