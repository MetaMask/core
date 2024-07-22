import {
  processOnChainNotification
} from "./chunk-BONB66A2.mjs";
import {
  isFeatureAnnouncementRead,
  processFeatureAnnouncement
} from "./chunk-D42BBXBM.mjs";
import {
  TRIGGER_TYPES
} from "./chunk-J4D2NH6Y.mjs";

// src/NotificationServicesController/processors/process-notifications.ts
var isOnChainNotification = (n) => Object.values(TRIGGER_TYPES).includes(n.type);
var isFeatureAnnouncement = (n) => n.type === "features_announcement" /* FEATURES_ANNOUNCEMENT */;
function processNotification(notification, readNotifications = []) {
  const exhaustedAllCases = (_) => {
    const type = notification?.type;
    throw new Error(`No processor found for notification kind ${type}`);
  };
  if (isFeatureAnnouncement(notification)) {
    const n = processFeatureAnnouncement(
      notification
    );
    n.isRead = isFeatureAnnouncementRead(n, readNotifications);
    return n;
  }
  if (isOnChainNotification(notification)) {
    return processOnChainNotification(notification);
  }
  return exhaustedAllCases(notification);
}
function safeProcessNotification(notification, readNotifications = []) {
  try {
    const processedNotification = processNotification(
      notification,
      readNotifications
    );
    return processedNotification;
  } catch {
    return void 0;
  }
}

export {
  processNotification,
  safeProcessNotification
};
//# sourceMappingURL=chunk-KCWTVLMK.mjs.map