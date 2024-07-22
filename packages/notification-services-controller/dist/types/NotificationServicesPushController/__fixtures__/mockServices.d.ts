import nock from 'nock';
type MockReply = {
    status: nock.StatusCode;
    body?: nock.Body;
};
export declare const mockEndpointGetPushNotificationLinks: (mockReply?: MockReply) => nock.Scope;
export declare const mockEndpointUpdatePushNotificationLinks: (mockReply?: MockReply) => nock.Scope;
export {};
//# sourceMappingURL=mockServices.d.ts.map