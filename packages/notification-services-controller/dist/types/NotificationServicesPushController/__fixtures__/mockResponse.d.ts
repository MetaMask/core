import type { LinksResult } from '../services/services';
export declare const MOCK_REG_TOKEN = "REG_TOKEN";
export declare const MOCK_LINKS_RESPONSE: LinksResult;
export declare const getMockRetrievePushNotificationLinksResponse: () => {
    url: string;
    requestMethod: "GET";
    response: LinksResult;
};
export declare const getMockUpdatePushNotificationLinksResponse: () => {
    url: string;
    requestMethod: "POST";
    response: null;
};
export declare const MOCK_FCM_RESPONSE: {
    name: string;
    token: string;
    web: {
        endpoint: string;
        p256dh: string;
        auth: string;
        applicationPubKey: string;
    };
};
export declare const getMockCreateFCMRegistrationTokenResponse: () => {
    url: RegExp;
    requestMethod: "POST";
    response: {
        name: string;
        token: string;
        web: {
            endpoint: string;
            p256dh: string;
            auth: string;
            applicationPubKey: string;
        };
    };
};
export declare const getMockDeleteFCMRegistrationTokenResponse: () => {
    url: RegExp;
    requestMethod: "POST";
    response: {};
};
//# sourceMappingURL=mockResponse.d.ts.map