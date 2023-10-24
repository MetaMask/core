import { BaseControllerV2 } from '@metamask/base-controller';
import type { RestrictedControllerMessenger } from '@metamask/base-controller';
import type {
  JsonRpcEngineEndCallback,
  JsonRpcEngineNextCallback,
} from '@metamask/json-rpc-engine';
import type {
  JsonRpcParams,
  JsonRpcRequest,
  PendingJsonRpcResponse,
} from '@metamask/utils';

import {
  LOG_IGNORE_METHODS,
  LOG_LIMIT,
  LOG_METHOD_TYPES,
  WALLET_PREFIX,
} from './enums';
import { CaveatTypes } from './permissions';

export type PermissionActivityLog = {
  id: string;
  method: string;
  methodType: LOG_METHOD_TYPES;
  origin: string;
  requestTime: number;
  responseTime: number | null;
  success: boolean | null;
};

export type Permission = {
  parentCapability: string;
  caveats: Caveat[];
};

export type PermissionName = string;
export type PermissionLog = {
  accounts?: Record<string, number>;
  lastApproved: number;
};
export type PermissionEntry = Record<PermissionName, PermissionLog>;

export type PermissionOrigin = string;
export type PermissionHistory = Record<PermissionOrigin, PermissionEntry>;

export type Caveat = {
  type: string;
  value: string;
};

export type EnhancedJsonRpcRequest<
  Params extends JsonRpcParams = JsonRpcParams,
> = JsonRpcRequest<Params> & {
  id: string;
  origin: string;
};

/**
 * @type PermissionLogState
 *
 * Permission log controller state
 * @property permissionHistory - permission history
 * @property permissionActivityLog - permission activity logs
 */
export type PermissionLogState = {
  permissionHistory: PermissionHistory;
  permissionActivityLog: PermissionActivityLog[];
};

export type PermissionLogControllerOptions = {
  restrictedMethods: Set<string>;
  state?: Partial<PermissionLogState>;
  messenger: PermissionLogControllerMessenger;
};

export type PermissionLogControllerMessenger = RestrictedControllerMessenger<
  typeof name,
  never,
  never,
  never,
  never
>;

export const defaultState: PermissionLogState = {
  permissionHistory: {},
  permissionActivityLog: [],
};

/**
 * The name of the {@link PermissionController}.
 */
const name = 'PermissionLogController';

/**
 * Controller with middleware for logging requests and responses to restricted
 * and permissions-related methods.
 */
export class PermissionLogController extends BaseControllerV2<
  typeof name,
  PermissionLogState,
  PermissionLogControllerMessenger
> {
  restrictedMethods: Set<string>;

  constructor({
    messenger,
    restrictedMethods,
    state,
  }: PermissionLogControllerOptions) {
    super({
      messenger,
      name,
      metadata: {
        permissionHistory: {
          persist: true,
          anonymous: false,
        },
        permissionActivityLog: {
          persist: true,
          anonymous: false,
        },
      },
      state: { ...defaultState, ...state },
    });
    this.restrictedMethods = restrictedMethods;
  }

  /**
   * Get the restricted method activity log.
   *
   * @returns The activity log.
   */
  getActivityLog(): PermissionActivityLog[] {
    return this.state.permissionActivityLog;
  }

  /**
   * Update the restricted method activity log.
   *
   * @param logs - The new activity log array.
   */
  updateActivityLog(logs: PermissionActivityLog[]) {
    this.update((state) => {
      state.permissionActivityLog = logs;
    });
  }

  /**
   * Get the permission history log.
   *
   * @returns The permissions history log.
   */
  getHistory() {
    return this.state.permissionHistory;
  }

  /**
   * Update the permission history log.
   *
   * @param history - The new permissions history log object.
   */
  updateHistory(history: PermissionHistory) {
    this.update((state) => {
      state.permissionHistory = history;
    });
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
  updateAccountsHistory(origin: string, accounts: string[]) {
    if (accounts.length === 0) {
      return;
    }

    const accountToTimeMap = getAccountToTimeMap(accounts, Date.now());

    this.commitNewHistory(origin, {
      eth_accounts: {
        accounts: accountToTimeMap,
      },
    });
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
    return (
      req: EnhancedJsonRpcRequest,
      res: PendingJsonRpcResponse<(string | Permission)[]>,
      next: JsonRpcEngineNextCallback,
      _end?: JsonRpcEngineEndCallback,
    ) => {
      let activityEntry: any, requestedMethods: string[] | null;
      const { origin, method } = req;
      const isInternal = method.startsWith(WALLET_PREFIX);

      // we only log certain methods
      if (
        !LOG_IGNORE_METHODS.includes(method) &&
        (isInternal || this.restrictedMethods.has(method))
      ) {
        activityEntry = this.logRequest(req, isInternal);

        if (method === `${WALLET_PREFIX}requestPermissions`) {
          // get the corresponding methods from the requested permissions so
          // that we can record permissions history
          requestedMethods = this.getRequestedMethods(req);
        }
      } else if (method === 'eth_requestAccounts') {
        // eth_requestAccounts is a special case; we need to extract the accounts
        // from it
        activityEntry = this.logRequest(req, isInternal);
        requestedMethods = ['eth_accounts'];
      } else {
        // no-op
        next();
        return;
      }

      // call next with a return handler for capturing the response
      next((cb) => {
        const time = Date.now();
        this.logResponse(activityEntry, res, time);

        if (requestedMethods && !res.error && res.result) {
          // any permissions or accounts changes will be recorded on the response,
          // so we only log permissions history here
          this.logPermissionsHistory(
            requestedMethods,
            origin,
            res.result,
            time,
            method === 'eth_requestAccounts',
          );
        }
        cb();
      });
    };
  }

  /**
   * Creates and commits an activity log entry, without response data.
   *
   * @param request - The request object.
   * @param isInternal - Whether the request is internal.
   * @returns new added activity entry
   */
  logRequest(
    request: EnhancedJsonRpcRequest,
    isInternal: boolean,
  ): PermissionActivityLog {
    const activityEntry: PermissionActivityLog = {
      id: request.id,
      method: request.method,
      methodType: isInternal
        ? LOG_METHOD_TYPES.internal
        : LOG_METHOD_TYPES.restricted,
      origin: request.origin,
      requestTime: Date.now(),
      responseTime: null,
      success: null,
    };
    this.commitNewActivity(activityEntry);
    return activityEntry;
  }

  /**
   * Adds response data to an existing activity log entry.
   * Entry assumed already committed (i.e., in the log).
   *
   * @param entry - The entry to add a response to.
   * @param response - The response object.
   * @param time - Output from Date.now()
   */
  logResponse(entry: any, response: any, time: number) {
    if (!entry || !response) {
      return;
    }

    // The JSON-RPC 2.0 specification defines "success" by the presence of
    // either the "result" or "error" property. The specification forbids
    // both properties from being present simultaneously, and our JSON-RPC
    // stack is spec-compliant at the time of writing.
    entry.success = Object.hasOwnProperty.call(response, 'result');
    entry.responseTime = time;
  }

  /**
   * Commit a new entry to the activity log.
   * Removes the oldest entry from the log if it exceeds the log limit.
   *
   * @param entry - The activity log entry.
   */
  commitNewActivity(entry: PermissionActivityLog) {
    const logs = this.getActivityLog();

    // add new entry to end of log
    logs.push(entry);

    // remove oldest log if exceeding size limit
    if (logs.length > LOG_LIMIT) {
      logs.shift();
    }

    this.updateActivityLog(logs);
  }

  /**
   * Create new permissions history log entries, if any, and commit them.
   *
   * @param requestedMethods - The method names corresponding to the requested permissions.
   * @param origin - The origin of the permissions request.
   * @param result - The permissions request response.result.
   * @param time - The time of the request, i.e. Date.now().
   * @param isEthRequestAccounts - Whether the permissions request was 'eth_requestAccounts'.
   */
  logPermissionsHistory(
    requestedMethods: string[],
    origin: string,
    result: (string | Permission)[],
    time: number,
    isEthRequestAccounts: boolean,
  ) {
    let accounts: string[];
    let newEntries: PermissionEntry;

    if (isEthRequestAccounts) {
      accounts = result as string[];
      const accountToTimeMap = getAccountToTimeMap(accounts, time);

      newEntries = {
        eth_accounts: {
          accounts: accountToTimeMap,
          lastApproved: time,
        },
      };
    } else {
      // Records new "lastApproved" times for the granted permissions, if any.
      // Special handling for eth_accounts, in order to record the time the
      // accounts were last seen or approved by the origin.
      newEntries = (result as Permission[])
        .map((perm) => {
          if (perm.parentCapability === 'eth_accounts') {
            accounts = this.getAccountsFromPermission(perm);
          }

          return perm.parentCapability;
        })
        .reduce((acc: PermissionEntry, method) => {
          // all approved permissions will be included in the response,
          // not just the newly requested ones
          if (requestedMethods.includes(method)) {
            if (method === 'eth_accounts') {
              const accountToTimeMap = getAccountToTimeMap(accounts, time);

              acc[method] = {
                lastApproved: time,
                accounts: accountToTimeMap,
              };
            } else {
              acc[method] = { lastApproved: time };
            }
          }

          return acc;
        }, {});
    }

    if (Object.keys(newEntries).length > 0) {
      this.commitNewHistory(origin, newEntries);
    }
  }

  /**
   * Commit new entries to the permissions history log.
   * Merges the history for the given origin, overwriting existing entries
   * with the same key (permission name).
   *
   * @param origin - The requesting origin.
   * @param newEntries - The new entries to commit.
   */
  commitNewHistory(
    origin: string,
    newEntries: Record<PermissionName, Partial<PermissionLog>>,
  ) {
    // a simple merge updates most permissions
    const history = this.getHistory();
    const newOriginHistory = {
      ...history[origin],
      ...newEntries,
    };

    // eth_accounts requires special handling, because of information
    // we store about the accounts
    const existingEthAccountsEntry =
      history[origin] && history[origin].eth_accounts;
    const newEthAccountsEntry = newEntries.eth_accounts;

    if (existingEthAccountsEntry && newEthAccountsEntry) {
      // we may intend to update just the accounts, not the permission
      // itself
      const lastApproved =
        newEthAccountsEntry.lastApproved ||
        existingEthAccountsEntry.lastApproved;

      // merge old and new eth_accounts history entries
      newOriginHistory.eth_accounts = {
        lastApproved,
        accounts: {
          ...existingEthAccountsEntry.accounts,
          ...newEthAccountsEntry.accounts,
        },
      };
    }

    history[origin] = newOriginHistory as PermissionEntry;

    this.updateHistory(history);
  }

  /**
   * Get all requested methods from a permissions request.
   *
   * @param request - The request object.
   * @returns The names of the requested permissions.
   */
  getRequestedMethods(request: EnhancedJsonRpcRequest<any>): string[] | null {
    if (
      !request.params ||
      !request.params[0] ||
      typeof request.params[0] !== 'object' ||
      Array.isArray(request.params[0])
    ) {
      return null;
    }
    return Object.keys(request.params[0]);
  }

  /**
   * Get the permitted accounts from an eth_accounts permissions object.
   * Returns an empty array if the permission is not eth_accounts.
   *
   * @param perm - The permissions object.
   * @param perm.parentCapability - The permissions parentCapability.
   * @param perm.caveats - The permissions caveats.
   * @returns The permitted accounts.
   */
  getAccountsFromPermission(perm: Permission): string[] {
    if (perm.parentCapability !== 'eth_accounts' || !perm.caveats) {
      return [];
    }

    const accounts = new Set<string>();
    for (const caveat of perm.caveats) {
      if (
        caveat.type === CaveatTypes.restrictReturnedAccounts &&
        Array.isArray(caveat.value)
      ) {
        for (const value of caveat.value) {
          accounts.add(value);
        }
      }
    }
    return [...accounts];
  }
}

// helper functions

/**
 * Get a map from account addresses to the given time.
 *
 * @param accounts - An array of addresses.
 * @param time - A time, e.g. Date.now().
 * @returns A string:number map of addresses to time.
 */
function getAccountToTimeMap(
  accounts: string[],
  time: number,
): Record<string, number> {
  return accounts.reduce((acc, account) => ({ ...acc, [account]: time }), {});
}
