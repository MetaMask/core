import * as allExports from '.';

describe('@metamask/notification-services-controller', () => {
  it('has expected JavaScript exports', () => {
    expect(Object.keys(allExports)).toMatchInlineSnapshot(`
    Array [
      "MOCK_REG_TOKEN",
      "MOCK_LINKS_RESPONSE",
      "getMockRetrievePushNotificationLinksResponse",
      "getMockUpdatePushNotificationLinksResponse",
      "MOCK_FCM_RESPONSE",
      "getMockCreateFCMRegistrationTokenResponse",
      "getMockDeleteFCMRegistrationTokenResponse",
      "NotificationServicesPushControllerState",
      "NotificationServicesPushControllerEnablePushNotificationsAction",
      "NotificationServicesPushControllerDisablePushNotificationsAction",
      "NotificationServicesPushControllerUpdateTriggerPushNotificationsAction",
      "Actions",
      "AllowedActions",
      "NotificationServicesPushControllerOnNewNotificationEvent",
      "NotificationServicesPushControllerPushNotificationClicked",
      "AllowedEvents",
      "NotificationServicesPushControllerMessenger",
      "defaultState",
      "NotificationServicesPushController",
      "NotificationServicesController",
      "NotificationServicesControllerTypes",
      "NotificationServicesControllerMocks",
      "NotificationServicesControllerProcessors",
      "NotificationServicesControllerConstants",
      "NotificationServicesControllerUI"
    ]`);
  });
});
