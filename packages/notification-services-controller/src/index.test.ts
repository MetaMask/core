import * as allExports from '.';

describe('@metamask/notification-services-controller', () => {
  it('has expected JavaScript exports', () => {
    expect(Object.keys(allExports)).toMatchInlineSnapshot(`
    Array [
      "NotificationServicesController",
      "NotificationsServicesPushController",
      "MOCK_REG_TOKEN",
      "MOCK_LINKS_RESPONSE",
      "getMockRetrievePushNotificationLinksResponse",
      "getMockUpdatePushNotificationLinksResponse",
      "MOCK_FCM_RESPONSE",
      "getMockCreateFCMRegistrationTokenResponse",
      "getMockDeleteFCMRegistrationTokenResponse",
      "PushNotificationEnv",
      "Messaging",
      "FirebaseApp",
      "FirebaseOptions",
      "NotificationPayload",
      "FcmOptions",
      "MessagePayload",
      "GetTokenOptions"
    ]`);
  });
});