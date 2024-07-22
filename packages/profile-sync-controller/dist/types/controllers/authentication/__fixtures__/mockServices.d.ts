import nock from 'nock';
type MockReply = {
    status: nock.StatusCode;
    body?: nock.Body;
};
export declare const mockEndpointGetNonce: (mockReply?: MockReply) => nock.Scope;
export declare const mockEndpointLogin: (mockReply?: MockReply) => nock.Scope;
export declare const mockEndpointAccessToken: (mockReply?: MockReply) => nock.Scope;
export {};
//# sourceMappingURL=mockServices.d.ts.map