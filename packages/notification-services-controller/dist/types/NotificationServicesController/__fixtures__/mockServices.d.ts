import nock from 'nock';
type MockReply = {
    status: nock.StatusCode;
    body?: nock.Body;
};
export declare const mockFetchFeatureAnnouncementNotifications: (mockReply?: MockReply) => nock.Scope;
export declare const mockBatchCreateTriggers: (mockReply?: MockReply) => nock.Scope;
export declare const mockBatchDeleteTriggers: (mockReply?: MockReply) => nock.Scope;
export declare const mockListNotifications: (mockReply?: MockReply) => nock.Scope;
export declare const mockMarkNotificationsAsRead: (mockReply?: MockReply) => nock.Scope;
export {};
//# sourceMappingURL=mockServices.d.ts.map