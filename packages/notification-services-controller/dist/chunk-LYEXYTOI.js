"use strict";Object.defineProperty(exports, "__esModule", {value: true});// src/NotificationServicesController/processors/process-onchain-notifications.ts
function processOnChainNotification(notification) {
  return {
    ...notification,
    id: notification.id,
    createdAt: new Date(notification.created_at).toISOString(),
    isRead: !notification.unread
  };
}



exports.processOnChainNotification = processOnChainNotification;
//# sourceMappingURL=chunk-LYEXYTOI.js.map