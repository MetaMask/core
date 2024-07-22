// src/NotificationServicesController/processors/process-feature-announcement.ts
var ONE_DAY_MS = 1e3 * 60 * 60 * 24;
var shouldAutoExpire = (oldDate) => {
  const differenceInTime = Date.now() - oldDate.getTime();
  const differenceInDays = differenceInTime / ONE_DAY_MS;
  return differenceInDays >= 90;
};
function isFeatureAnnouncementRead(notification, readPlatformNotificationsList) {
  if (readPlatformNotificationsList.includes(notification.id)) {
    return true;
  }
  return shouldAutoExpire(new Date(notification.createdAt));
}
function processFeatureAnnouncement(notification) {
  return {
    type: notification.type,
    id: notification.data.id,
    createdAt: new Date(notification.createdAt).toISOString(),
    data: notification.data,
    isRead: false
  };
}

export {
  isFeatureAnnouncementRead,
  processFeatureAnnouncement
};
//# sourceMappingURL=chunk-D42BBXBM.mjs.map