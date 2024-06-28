import * as allExports from '.';

describe('@metamask/notification-controller', () => {
  it('has expected JavaScript exports', () => {
    expect(Object.keys(allExports)).toMatchInlineSnapshot(`
      Array [
        "NotificationController",
        "NotificationControllerState",
        "Notification",
        "NotificationControllerStateChange",
        "GetNotificationControllerState",
        "ShowNotification",
        "DismissNotification",
        "MarkNotificationRead",
        "ClearNotifications",
        "NotificationControllerActions",
        "NotificationControllerMessenger",
      ]
    `);
  });
});
