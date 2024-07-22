import {
  TRIGGERS
} from "./chunk-J4D2NH6Y.mjs";
import {
  USER_STORAGE_VERSION,
  USER_STORAGE_VERSION_KEY
} from "./chunk-6ZDVTRRT.mjs";

// src/NotificationServicesController/utils/utils.ts
import { v4 as uuidv4 } from "uuid";
var triggerToId = (trigger) => trigger.id;
var triggerIdentity = (trigger) => trigger;
function initializeUserStorage(accounts, state) {
  const userStorage = {
    [USER_STORAGE_VERSION_KEY]: USER_STORAGE_VERSION
  };
  accounts.forEach((account) => {
    const address = account.address?.toLowerCase();
    if (!address) {
      return;
    }
    if (!userStorage[address]) {
      userStorage[address] = {};
    }
    Object.entries(TRIGGERS).forEach(
      ([trigger, { supported_chains: supportedChains }]) => {
        supportedChains.forEach((chain) => {
          if (!userStorage[address]?.[chain]) {
            userStorage[address][chain] = {};
          }
          userStorage[address][chain][uuidv4()] = {
            k: trigger,
            // use 'k' instead of 'kind' to reduce the json weight
            e: state
            // use 'e' instead of 'enabled' to reduce the json weight
          };
        });
      }
    );
  });
  return userStorage;
}
function traverseUserStorageTriggers(userStorage, options) {
  const triggers = [];
  const mapTrigger = options?.mapTrigger ?? triggerIdentity;
  for (const address in userStorage) {
    if (address === USER_STORAGE_VERSION_KEY) {
      continue;
    }
    if (options?.address && address !== options.address) {
      continue;
    }
    for (const chainId in userStorage[address]) {
      if (chainId in userStorage[address]) {
        for (const uuid in userStorage[address][chainId]) {
          if (uuid) {
            const mappedTrigger = mapTrigger({
              id: uuid,
              kind: userStorage[address]?.[chainId]?.[uuid]?.k,
              chainId,
              address,
              enabled: userStorage[address]?.[chainId]?.[uuid]?.e ?? false
            });
            if (mappedTrigger) {
              triggers.push(mappedTrigger);
            }
          }
        }
      }
    }
  }
  return triggers;
}
function checkAccountsPresence(userStorage, accounts) {
  const presenceRecord = {};
  accounts.forEach((account) => {
    presenceRecord[account.toLowerCase()] = isAccountEnabled(
      account,
      userStorage
    );
  });
  return presenceRecord;
}
function isAccountEnabled(accountAddress, userStorage) {
  const accountObject = userStorage[accountAddress?.toLowerCase()];
  if (!accountObject) {
    return false;
  }
  for (const [triggerKind, triggerConfig] of Object.entries(TRIGGERS)) {
    for (const chain of triggerConfig.supported_chains) {
      if (!accountObject[chain]) {
        return false;
      }
      const triggerExists = Object.values(accountObject[chain]).some(
        (obj) => obj.k === triggerKind
      );
      if (!triggerExists) {
        return false;
      }
      for (const uuid in accountObject[chain]) {
        if (!accountObject[chain][uuid].e) {
          return false;
        }
      }
    }
  }
  return true;
}
function inferEnabledKinds(userStorage) {
  const allSupportedKinds = /* @__PURE__ */ new Set();
  traverseUserStorageTriggers(userStorage, {
    mapTrigger: (t) => {
      allSupportedKinds.add(t.kind);
    }
  });
  return Array.from(allSupportedKinds);
}
function getUUIDsForAccount(userStorage, address) {
  return traverseUserStorageTriggers(userStorage, {
    address,
    mapTrigger: triggerToId
  });
}
function getAllUUIDs(userStorage) {
  return traverseUserStorageTriggers(userStorage, {
    mapTrigger: triggerToId
  });
}
function getUUIDsForKinds(userStorage, allowedKinds) {
  const kindsSet = new Set(allowedKinds);
  return traverseUserStorageTriggers(userStorage, {
    mapTrigger: (t) => kindsSet.has(t.kind) ? t.id : void 0
  });
}
function getUUIDsForAccountByKinds(userStorage, address, allowedKinds) {
  const allowedKindsSet = new Set(allowedKinds);
  return traverseUserStorageTriggers(userStorage, {
    address,
    mapTrigger: (trigger) => {
      if (allowedKindsSet.has(trigger.kind)) {
        return trigger;
      }
      return void 0;
    }
  });
}
function upsertAddressTriggers(_account, userStorage) {
  const account = _account.toLowerCase();
  userStorage[account] = userStorage[account] || {};
  for (const [trigger, { supported_chains: supportedChains }] of Object.entries(
    TRIGGERS
  )) {
    for (const chain of supportedChains) {
      userStorage[account][chain] = userStorage[account][chain] || {};
      const existingTrigger = Object.values(userStorage[account][chain]).find(
        (obj) => obj.k === trigger
      );
      if (!existingTrigger) {
        const uuid = uuidv4();
        userStorage[account][chain][uuid] = {
          k: trigger,
          e: false
        };
      }
    }
  }
  return userStorage;
}
function upsertTriggerTypeTriggers(triggerType, userStorage) {
  Object.entries(userStorage).forEach(([account, chains]) => {
    if (account === USER_STORAGE_VERSION_KEY) {
      return;
    }
    Object.entries(chains).forEach(([chain, triggers]) => {
      const existingTrigger = Object.values(triggers).find(
        (obj) => obj.k === triggerType
      );
      if (!existingTrigger) {
        const uuid = uuidv4();
        userStorage[account][chain][uuid] = {
          k: triggerType,
          e: false
        };
      }
    });
  });
  return userStorage;
}
function toggleUserStorageTriggerStatus(userStorage, address, chainId, uuid, enabled) {
  if (userStorage?.[address]?.[chainId]?.[uuid]) {
    userStorage[address][chainId][uuid].e = enabled;
  }
  return userStorage;
}
async function makeApiCall(bearerToken, endpoint, method, body) {
  const options = {
    method,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${bearerToken}`
    },
    body: JSON.stringify(body)
  };
  return await fetch(endpoint, options);
}

export {
  initializeUserStorage,
  traverseUserStorageTriggers,
  checkAccountsPresence,
  inferEnabledKinds,
  getUUIDsForAccount,
  getAllUUIDs,
  getUUIDsForKinds,
  getUUIDsForAccountByKinds,
  upsertAddressTriggers,
  upsertTriggerTypeTriggers,
  toggleUserStorageTriggerStatus,
  makeApiCall
};
//# sourceMappingURL=chunk-ILPTPB4U.mjs.map