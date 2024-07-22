"use strict";Object.defineProperty(exports, "__esModule", {value: true});








var _chunkMF2HNE3Kjs = require('./chunk-MF2HNE3K.js');

// src/PermissionLogController.ts


var _basecontroller = require('@metamask/base-controller');


var _utils = require('@metamask/utils');
var defaultState = {
  permissionHistory: {},
  permissionActivityLog: []
};
var name = "PermissionLogController";
var _restrictedMethods, _getAccountToTimeMap, getAccountToTimeMap_fn, _logRequest, logRequest_fn, _logResponse, logResponse_fn, _logPermissionsHistory, logPermissionsHistory_fn, _commitNewHistory, commitNewHistory_fn, _getRequestedMethods, getRequestedMethods_fn, _getAccountsFromPermission, getAccountsFromPermission_fn;
var PermissionLogController = class extends _basecontroller.BaseController {
  constructor({
    messenger,
    restrictedMethods,
    state
  }) {
    super({
      messenger,
      name,
      metadata: {
        permissionHistory: {
          persist: true,
          anonymous: false
        },
        permissionActivityLog: {
          persist: true,
          anonymous: false
        }
      },
      state: { ...defaultState, ...state }
    });
    /**
     * Get a map from account addresses to the given time.
     *
     * @param accounts - An array of addresses.
     * @param time - A time, e.g. Date.now().
     * @returns A string:number map of addresses to time.
     */
    _chunkMF2HNE3Kjs.__privateAdd.call(void 0, this, _getAccountToTimeMap);
    /**
     * Creates and commits an activity log entry, without response data.
     *
     * @param request - The request object.
     * @param isInternal - Whether the request is internal.
     * @returns new added activity entry
     */
    _chunkMF2HNE3Kjs.__privateAdd.call(void 0, this, _logRequest);
    /**
     * Adds response data to an existing activity log entry.
     * Entry assumed already committed (i.e., in the log).
     *
     * @param entry - The entry to add a response to.
     * @param response - The response object.
     * @param time - Output from Date.now()
     */
    _chunkMF2HNE3Kjs.__privateAdd.call(void 0, this, _logResponse);
    /**
     * Create new permissions history log entries, if any, and commit them.
     *
     * @param requestedMethods - The method names corresponding to the requested permissions.
     * @param origin - The origin of the permissions request.
     * @param result - The permissions request response.result.
     * @param time - The time of the request, i.e. Date.now().
     * @param isEthRequestAccounts - Whether the permissions request was 'eth_requestAccounts'.
     */
    _chunkMF2HNE3Kjs.__privateAdd.call(void 0, this, _logPermissionsHistory);
    /**
     * Commit new entries to the permissions history log.
     * Merges the history for the given origin, overwriting existing entries
     * with the same key (permission name).
     *
     * @param origin - The requesting origin.
     * @param newEntries - The new entries to commit.
     */
    _chunkMF2HNE3Kjs.__privateAdd.call(void 0, this, _commitNewHistory);
    /**
     * Get all requested methods from a permissions request.
     *
     * @param request - The request object.
     * @returns The names of the requested permissions.
     */
    _chunkMF2HNE3Kjs.__privateAdd.call(void 0, this, _getRequestedMethods);
    /**
     * Get the permitted accounts from an eth_accounts permissions object.
     * Returns an empty array if the permission is not eth_accounts.
     *
     * @param permission - The permissions object.
     * @param permission.parentCapability - The permissions parentCapability.
     * @param permission.caveats - The permissions caveats.
     * @returns The permitted accounts.
     */
    _chunkMF2HNE3Kjs.__privateAdd.call(void 0, this, _getAccountsFromPermission);
    _chunkMF2HNE3Kjs.__privateAdd.call(void 0, this, _restrictedMethods, void 0);
    _chunkMF2HNE3Kjs.__privateSet.call(void 0, this, _restrictedMethods, restrictedMethods);
  }
  /**
   * Updates the exposed account history for the given origin.
   * Sets the 'last seen' time to Date.now() for the given accounts.
   * Does **not** update the 'lastApproved' time for the permission itself.
   * Returns if the accounts array is empty.
   *
   * @param origin - The origin that the accounts are exposed to.
   * @param accounts - The accounts.
   */
  updateAccountsHistory(origin, accounts) {
    if (accounts.length === 0) {
      return;
    }
    const newEntries = {
      // TODO: Either fix this lint violation or explain why it's necessary to ignore.
      // eslint-disable-next-line @typescript-eslint/naming-convention
      eth_accounts: {
        accounts: _chunkMF2HNE3Kjs.__privateMethod.call(void 0, this, _getAccountToTimeMap, getAccountToTimeMap_fn).call(this, accounts, Date.now())
      }
    };
    _chunkMF2HNE3Kjs.__privateMethod.call(void 0, this, _commitNewHistory, commitNewHistory_fn).call(this, origin, newEntries);
  }
  /**
   * Create a permissions log middleware. Records permissions activity and history:
   *
   * Activity: requests and responses for restricted and most wallet_ methods.
   *
   * History: for each origin, the last time a permission was granted, including
   * which accounts were exposed, if any.
   *
   * @returns The permissions log middleware.
   */
  createMiddleware() {
    return (req, res, next) => {
      const { origin, method } = req;
      const isInternal = method.startsWith(_chunkMF2HNE3Kjs.WALLET_PREFIX);
      const isEthRequestAccounts = method === "eth_requestAccounts";
      if (!_chunkMF2HNE3Kjs.LOG_IGNORE_METHODS.includes(method) && (isInternal || _chunkMF2HNE3Kjs.__privateGet.call(void 0, this, _restrictedMethods).has(method)) || isEthRequestAccounts) {
        const activityEntry = _chunkMF2HNE3Kjs.__privateMethod.call(void 0, this, _logRequest, logRequest_fn).call(this, req, isInternal);
        const requestedMethods = _chunkMF2HNE3Kjs.__privateMethod.call(void 0, this, _getRequestedMethods, getRequestedMethods_fn).call(this, req);
        next((cb) => {
          const time = Date.now();
          _chunkMF2HNE3Kjs.__privateMethod.call(void 0, this, _logResponse, logResponse_fn).call(this, activityEntry, res, time);
          if (requestedMethods && !res.error && res.result && origin) {
            _chunkMF2HNE3Kjs.__privateMethod.call(void 0, this, _logPermissionsHistory, logPermissionsHistory_fn).call(this, requestedMethods, origin, res.result, time, isEthRequestAccounts);
          }
          cb();
        });
        return;
      }
      next();
    };
  }
};
_restrictedMethods = new WeakMap();
_getAccountToTimeMap = new WeakSet();
getAccountToTimeMap_fn = function(accounts, time) {
  return accounts.reduce(
    (acc, account) => ({
      ...acc,
      [account]: time
    }),
    {}
  );
};
_logRequest = new WeakSet();
logRequest_fn = function(request, isInternal) {
  const activityEntry = {
    id: request.id,
    method: request.method,
    methodType: isInternal ? "internal" /* internal */ : "restricted" /* restricted */,
    origin: request.origin,
    requestTime: Date.now(),
    responseTime: null,
    success: null
  };
  this.update((state) => {
    const newLogs = [...state.permissionActivityLog, activityEntry];
    state.permissionActivityLog = // remove oldest log if exceeding size limit
    newLogs.length > _chunkMF2HNE3Kjs.LOG_LIMIT ? newLogs.slice(1) : newLogs;
  });
  return activityEntry;
};
_logResponse = new WeakSet();
logResponse_fn = function(entry, response, time) {
  if (!entry || !response) {
    return;
  }
  this.update((state) => {
    state.permissionActivityLog = state.permissionActivityLog.map((log) => {
      if (log.id === entry.id) {
        return {
          ...log,
          success: _utils.hasProperty.call(void 0, response, "result"),
          responseTime: time
        };
      }
      return log;
    });
  });
};
_logPermissionsHistory = new WeakSet();
logPermissionsHistory_fn = function(requestedMethods, origin, result, time, isEthRequestAccounts) {
  let newEntries;
  if (isEthRequestAccounts) {
    const accounts = result;
    newEntries = {
      // TODO: Either fix this lint violation or explain why it's necessary to ignore.
      // eslint-disable-next-line @typescript-eslint/naming-convention
      eth_accounts: {
        accounts: _chunkMF2HNE3Kjs.__privateMethod.call(void 0, this, _getAccountToTimeMap, getAccountToTimeMap_fn).call(this, accounts, time),
        lastApproved: time
      }
    };
  } else {
    const permissions = result;
    newEntries = permissions.reduce((acc, permission) => {
      const method = permission.parentCapability;
      if (!requestedMethods.includes(method)) {
        return acc;
      }
      if (method === "eth_accounts") {
        const accounts = _chunkMF2HNE3Kjs.__privateMethod.call(void 0, this, _getAccountsFromPermission, getAccountsFromPermission_fn).call(this, permission);
        return {
          ...acc,
          [method]: {
            lastApproved: time,
            accounts: _chunkMF2HNE3Kjs.__privateMethod.call(void 0, this, _getAccountToTimeMap, getAccountToTimeMap_fn).call(this, accounts, time)
          }
        };
      }
      return {
        ...acc,
        [method]: {
          lastApproved: time
        }
      };
    }, {});
  }
  if (Object.keys(newEntries).length > 0) {
    _chunkMF2HNE3Kjs.__privateMethod.call(void 0, this, _commitNewHistory, commitNewHistory_fn).call(this, origin, newEntries);
  }
};
_commitNewHistory = new WeakSet();
commitNewHistory_fn = function(origin, newEntries) {
  const { permissionHistory } = this.state;
  const oldOriginHistory = permissionHistory[origin] ?? {};
  const newOriginHistory = {
    ...oldOriginHistory,
    ...newEntries
  };
  const existingEthAccountsEntry = oldOriginHistory.eth_accounts;
  const newEthAccountsEntry = newEntries.eth_accounts;
  if (existingEthAccountsEntry && newEthAccountsEntry) {
    const lastApproved = newEthAccountsEntry.lastApproved ?? existingEthAccountsEntry.lastApproved;
    newOriginHistory.eth_accounts = {
      lastApproved,
      accounts: {
        ...existingEthAccountsEntry.accounts,
        ...newEthAccountsEntry.accounts
      }
    };
  }
  this.update((state) => {
    state.permissionHistory = {
      ...permissionHistory,
      [origin]: newOriginHistory
    };
  });
};
_getRequestedMethods = new WeakSet();
getRequestedMethods_fn = function(request) {
  const { method, params } = request;
  if (method === "eth_requestAccounts") {
    return ["eth_accounts"];
  } else if (method === `${_chunkMF2HNE3Kjs.WALLET_PREFIX}requestPermissions` && params && Array.isArray(params) && params[0] && typeof params[0] === "object" && !Array.isArray(params[0])) {
    return Object.keys(params[0]);
  }
  return null;
};
_getAccountsFromPermission = new WeakSet();
getAccountsFromPermission_fn = function(permission) {
  if (permission.parentCapability !== "eth_accounts" || !permission.caveats) {
    return [];
  }
  const accounts = /* @__PURE__ */ new Set();
  for (const caveat of permission.caveats) {
    if (caveat.type === _chunkMF2HNE3Kjs.CAVEAT_TYPES.restrictReturnedAccounts && Array.isArray(caveat.value)) {
      for (const value of caveat.value) {
        accounts.add(value);
      }
    }
  }
  return [...accounts];
};



exports.PermissionLogController = PermissionLogController;
//# sourceMappingURL=chunk-F4V6DVN7.js.map