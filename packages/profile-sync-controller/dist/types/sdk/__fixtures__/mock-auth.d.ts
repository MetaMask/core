import nock from 'nock';
type MockReply = {
    status: nock.StatusCode;
    body?: nock.Body;
};
export declare const MOCK_JWT = "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCIsImtpZCI6ImIwNzE2N2U2LWJjNWUtNDgyZC1hNjRhLWU1MjQ0MjY2MGU3NyJ9.eyJzdWIiOiI1MzE0ODc5YWM2NDU1OGI3OTQ5ZmI4NWIzMjg2ZjZjNjUwODAzYmFiMTY0Y2QyOWNmMmM3YzdmMjMzMWMwZTRlIiwiaWF0IjoxNzA2MTEzMDYyLCJleHAiOjE3NjkxODUwNjMsImlzcyI6ImF1dGgubWV0YW1hc2suaW8iLCJhdWQiOiJwb3J0Zm9saW8ubWV0YW1hc2suaW8ifQ.E5UL6oABNweS8t5a6IBTqTf7NLOJbrhJSmEcsr7kwLp4bGvcENJzACwnsHDkA6PlzfDV09ZhAGU_F3hlS0j-erbY0k0AFR-GAtyS7E9N02D8RgUDz5oDR65CKmzM8JilgFA8UvruJ6OJGogroaOSOqzRES_s8MjHpP47RJ9lXrUesajsbOudXbuksXWg5QmWip6LLvjwr8UUzcJzNQilyIhiEpo4WdzWM4R3VtTwr4rHnWEvtYnYCov1jmI2w3YQ48y0M-3Y9IOO0ov_vlITRrOnR7Y7fRUGLUFmU5msD8mNWRywjQFLHfJJ1yNP5aJ8TkuCK3sC6kcUH335IVvukQ";
export declare const MOCK_ACCESS_JWT = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c";
export declare const MOCK_SRP_LOGIN_RESPONSE: {
    token: string;
    expires_in: number;
    profile: {
        profile_id: string;
        metametrics_id: string;
        identifier_id: string;
        identifier_type: string;
        encrypted_storage_key: string;
    };
};
export declare const MOCK_OIDC_TOKEN_RESPONSE: {
    access_token: string;
    expires_in: number;
};
export declare const handleMockNonce: (mockReply?: MockReply) => nock.Scope;
export declare const handleMockSiweLogin: (mockReply?: MockReply) => nock.Scope;
export declare const handleMockPairIdentifiers: (mockReply?: MockReply) => nock.Scope;
export declare const handleMockSrpLogin: (mockReply?: MockReply) => nock.Scope;
export declare const handleMockOAuth2Token: (mockReply?: MockReply) => nock.Scope;
export declare const arrangeAuthAPIs: (options?: {
    mockNonceUrl?: MockReply;
    mockOAuth2TokenUrl?: MockReply;
    mockSrpLoginUrl?: MockReply;
    mockSiweLoginUrl?: MockReply;
    mockPairIdentifiers?: MockReply;
}) => {
    mockNonceUrl: nock.Scope;
    mockOAuth2TokenUrl: nock.Scope;
    mockSrpLoginUrl: nock.Scope;
    mockSiweLoginUrl: nock.Scope;
    mockPairIdentifiersUrl: nock.Scope;
};
export {};
//# sourceMappingURL=mock-auth.d.ts.map