import nock from 'nock';
type MockReply = {
    status: nock.StatusCode;
    body?: nock.Body;
};
export declare const mockEndpointGetUserStorage: (mockReply?: MockReply) => nock.Scope;
export declare const mockEndpointUpsertUserStorage: (mockReply?: Pick<MockReply, 'status'>) => nock.Scope;
export {};
//# sourceMappingURL=mockServices.d.ts.map