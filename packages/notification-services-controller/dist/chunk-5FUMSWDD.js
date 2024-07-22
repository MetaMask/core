"use strict";Object.defineProperty(exports, "__esModule", {value: true});

var _chunkLYEXYTOIjs = require('./chunk-LYEXYTOI.js');



var _chunk52CALMRAjs = require('./chunk-52CALMRA.js');


var _chunkV6P5JEPTjs = require('./chunk-V6P5JEPT.js');

// src/NotificationServicesController/processors/process-notifications.ts
var isOnChainNotification = (n) => Object.values(_chunkV6P5JEPTjs.TRIGGER_TYPES).includes(n.type);
var isFeatureAnnouncement = (n) => n.type === "features_announcement" /* FEATURES_ANNOUNCEMENT */;
function processNotification(notification, readNotifications = []) {
  const exhaustedAllCases = (_) => {
    const type = notification?.type;
    throw new Error(`No processor found for notification kind ${type}`);
  };
  if (isFeatureAnnouncement(notification)) {
    const n = _chunk52CALMRAjs.processFeatureAnnouncement.call(void 0, 
      notification
    );
    n.isRead = _chunk52CALMRAjs.isFeatureAnnouncementRead.call(void 0, n, readNotifications);
    return n;
  }
  if (isOnChainNotification(notification)) {
    return _chunkLYEXYTOIjs.processOnChainNotification.call(void 0, notification);
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




exports.processNotification = processNotification; exports.safeProcessNotification = safeProcessNotification;
//# sourceMappingURL=chunk-5FUMSWDD.js.map