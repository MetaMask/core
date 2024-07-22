"use strict";Object.defineProperty(exports, "__esModule", {value: true}); function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }



var _chunkNOYP2T77js = require('./chunk-NOYP2T77.js');

// src/NotificationServicesController/services/onchain-notifications.ts
var _profilesynccontroller = require('@metamask/profile-sync-controller');
var _loglevel = require('loglevel'); var _loglevel2 = _interopRequireDefault(_loglevel);
var TRIGGER_API = "https://trigger.api.cx.metamask.io";
var NOTIFICATION_API = "https://notification.api.cx.metamask.io";
var TRIGGER_API_BATCH_ENDPOINT = `${TRIGGER_API}/api/v1/triggers/batch`;
var NOTIFICATION_API_LIST_ENDPOINT = `${NOTIFICATION_API}/api/v1/notifications`;
var NOTIFICATION_API_LIST_ENDPOINT_PAGE_QUERY = (page) => `${NOTIFICATION_API_LIST_ENDPOINT}?page=${page}&per_page=100`;
var NOTIFICATION_API_MARK_ALL_AS_READ_ENDPOINT = `${NOTIFICATION_API}/api/v1/notifications/mark-as-read`;
async function createOnChainTriggers(userStorage, storageKey, bearerToken, triggers) {
  const triggersToCreate = triggers.map((t) => ({
    id: t.id,
    token: _profilesynccontroller.UserStorageController.createSHA256Hash(t.id + storageKey),
    config: {
      kind: t.kind,
      // eslint-disable-next-line @typescript-eslint/naming-convention
      chain_id: Number(t.chainId),
      address: t.address
    }
  }));
  if (triggersToCreate.length === 0) {
    return;
  }
  const response = await _chunkNOYP2T77js.makeApiCall.call(void 0, 
    bearerToken,
    TRIGGER_API_BATCH_ENDPOINT,
    "POST",
    triggersToCreate
  );
  if (!response.ok) {
    const errorData = await response.json().catch(() => void 0);
    _loglevel2.default.error("Error creating triggers:", errorData);
    throw new Error("OnChain Notifications - unable to create triggers");
  }
  for (const trigger of triggersToCreate) {
    _chunkNOYP2T77js.toggleUserStorageTriggerStatus.call(void 0, 
      userStorage,
      trigger.config.address,
      String(trigger.config.chain_id),
      trigger.id,
      true
    );
  }
}
async function deleteOnChainTriggers(userStorage, storageKey, bearerToken, uuids) {
  const triggersToDelete = uuids.map((uuid) => ({
    id: uuid,
    token: _profilesynccontroller.UserStorageController.createSHA256Hash(uuid + storageKey)
  }));
  try {
    const response = await _chunkNOYP2T77js.makeApiCall.call(void 0, 
      bearerToken,
      TRIGGER_API_BATCH_ENDPOINT,
      "DELETE",
      triggersToDelete
    );
    if (!response.ok) {
      throw new Error(
        `Failed to delete on-chain notifications for uuids ${uuids.join(", ")}`
      );
    }
    for (const uuid of uuids) {
      for (const address in userStorage) {
        if (address in userStorage) {
          for (const chainId in userStorage[address]) {
            if (userStorage?.[address]?.[chainId]?.[uuid]) {
              delete userStorage[address][chainId][uuid];
            }
          }
        }
      }
    }
    const isEmpty = (obj = {}) => Object.keys(obj).length === 0;
    for (const address in userStorage) {
      if (address in userStorage) {
        for (const chainId in userStorage[address]) {
          if (isEmpty(userStorage?.[address]?.[chainId])) {
            delete userStorage[address][chainId];
          }
        }
        if (isEmpty(userStorage?.[address])) {
          delete userStorage[address];
        }
      }
    }
  } catch (err) {
    _loglevel2.default.error(
      `Error deleting on-chain notifications for uuids ${uuids.join(", ")}:`,
      err
    );
    throw err;
  }
  return userStorage;
}
async function getOnChainNotifications(userStorage, bearerToken) {
  const triggerIds = _chunkNOYP2T77js.traverseUserStorageTriggers.call(void 0, userStorage, {
    mapTrigger: (t) => {
      if (!t.enabled) {
        return void 0;
      }
      return t.id;
    }
  });
  if (triggerIds.length === 0) {
    return [];
  }
  const onChainNotifications = [];
  const PAGE_LIMIT = 2;
  for (let page = 1; page <= PAGE_LIMIT; page++) {
    try {
      const response = await _chunkNOYP2T77js.makeApiCall.call(void 0, 
        bearerToken,
        NOTIFICATION_API_LIST_ENDPOINT_PAGE_QUERY(page),
        "POST",
        // eslint-disable-next-line @typescript-eslint/naming-convention
        { trigger_ids: triggerIds }
      );
      const notifications = await response.json();
      const transformedNotifications = notifications.map(
        (n) => {
          if (!n.data?.kind) {
            return void 0;
          }
          return {
            ...n,
            type: n.data.kind
          };
        }
      ).filter((n) => Boolean(n));
      onChainNotifications.push(...transformedNotifications);
      if (notifications.length < 100) {
        page = PAGE_LIMIT + 1;
        break;
      }
    } catch (err) {
      _loglevel2.default.error(
        `Error fetching on-chain notifications for trigger IDs ${triggerIds.join(
          ", "
        )}:`,
        err
      );
    }
  }
  return onChainNotifications;
}
async function markNotificationsAsRead(bearerToken, notificationIds) {
  if (notificationIds.length === 0) {
    return;
  }
  try {
    const response = await _chunkNOYP2T77js.makeApiCall.call(void 0, 
      bearerToken,
      NOTIFICATION_API_MARK_ALL_AS_READ_ENDPOINT,
      "POST",
      { ids: notificationIds }
    );
    if (response.status !== 200) {
      const errorData = await response.json().catch(() => void 0);
      throw new Error(
        `Error marking notifications as read: ${errorData?.message}`
      );
    }
  } catch (err) {
    _loglevel2.default.error("Error marking notifications as read:", err);
    throw err;
  }
}












exports.TRIGGER_API = TRIGGER_API; exports.NOTIFICATION_API = NOTIFICATION_API; exports.TRIGGER_API_BATCH_ENDPOINT = TRIGGER_API_BATCH_ENDPOINT; exports.NOTIFICATION_API_LIST_ENDPOINT = NOTIFICATION_API_LIST_ENDPOINT; exports.NOTIFICATION_API_LIST_ENDPOINT_PAGE_QUERY = NOTIFICATION_API_LIST_ENDPOINT_PAGE_QUERY; exports.NOTIFICATION_API_MARK_ALL_AS_READ_ENDPOINT = NOTIFICATION_API_MARK_ALL_AS_READ_ENDPOINT; exports.createOnChainTriggers = createOnChainTriggers; exports.deleteOnChainTriggers = deleteOnChainTriggers; exports.getOnChainNotifications = getOnChainNotifications; exports.markNotificationsAsRead = markNotificationsAsRead;
//# sourceMappingURL=chunk-DNVD3CHQ.js.map