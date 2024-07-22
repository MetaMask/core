// src/NotificationServicesController/processors/process-onchain-notifications.ts
function processOnChainNotification(notification) {
  return {
    ...notification,
    id: notification.id,
    createdAt: new Date(notification.created_at).toISOString(),
    isRead: !notification.unread
  };
}

export {
  processOnChainNotification
};
//# sourceMappingURL=chunk-BONB66A2.mjs.map