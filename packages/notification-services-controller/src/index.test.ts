import * as allExports from '.';

describe('@metamask/notification-services-controller', () => {
  it('has expected JavaScript exports', () => {
    expect(Object.keys(allExports)).toMatchInlineSnapshot(`
      Array [
        "NotificationServicesController",
        "NotificationsServicesPushController",
        "defaultState",
        "NotificationServicesControllerState",
        "NotificationServicesControllerUpdateMetamaskNotificationsList",
        "NotificationServicesControllerDisableNotificationServices",
        "NotificationServicesControllerSelectIsNotificationServicesEnabled",
        "Actions",
        "AllowedActions",
        "NotificationServicesControllerMessengerEvents",
        "AllowedEvents",
        "NotificationServicesControllerMessenger",
        "NotificationServicesPushControllerEnablePushNotifications",
        "NotificationServicesPushControllerDisablePushNotifications",
        "NotificationServicesPushControllerUpdateTriggerPushNotifications",
        "NotificationServicesPushControllerOnNewNotification",
      ]
    `);
  });
});
