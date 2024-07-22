import type { LoginResponse, NonceResponse, OAuthTokenResponse } from '../services';
export declare const MOCK_NONCE = "4cbfqzoQpcNxVImGv";
export declare const MOCK_NONCE_RESPONSE: NonceResponse;
export declare const getMockAuthNonceResponse: () => {
    url: string;
    requestMethod: "GET";
    response: NonceResponse;
};
export declare const MOCK_JWT = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c";
export declare const MOCK_LOGIN_RESPONSE: LoginResponse;
export declare const getMockAuthLoginResponse: () => {
    url: string;
    requestMethod: "POST";
    response: LoginResponse;
};
export declare const MOCK_ACCESS_TOKEN: string;
export declare const MOCK_OATH_TOKEN_RESPONSE: OAuthTokenResponse;
export declare const getMockAuthAccessTokenResponse: () => {
    url: string;
    requestMethod: "POST";
    response: OAuthTokenResponse;
};
//# sourceMappingURL=mockResponses.d.ts.map