import {
  BaseController,
  type RestrictedControllerMessenger,
} from '@metamask/base-controller';
import type { JsonRpcMiddleware } from '@metamask/json-rpc-engine';
import {
  type Json,
  type JsonRpcRequest,
  type JsonRpcParams,
  type PendingJsonRpcResponse,
  hasProperty,
} from '@metamask/utils';

import {
  LOG_IGNORE_METHODS,
  LOG_LIMIT,
  LOG_METHOD_TYPES,
  WALLET_PREFIX,
  CAVEAT_TYPES,
} from './enums';

export type JsonRpcRequestWithOrigin<
  Params extends JsonRpcParams = JsonRpcParams,
> = JsonRpcRequest<Params> & {
  origin?: string;
};

export type Caveat = {
  type: string;
  value: string[];
};

export type Permission = {
  parentCapability: string;
  caveats?: Caveat[];
};

export type PermissionActivityLog = {
  id: string | number | null;
  method: string;
  methodType: LOG_METHOD_TYPES;
  origin?: string;
  requestTime: number;
  responseTime: number | null;
  success: boolean | null;
};

export type PermissionLog = {
  accounts?: Record<string, number>;
  lastApproved?: number;
};
export type PermissionEntry = Record<string, PermissionLog>;

export type PermissionHistory = Record<string, PermissionEntry>;

/**
 *
 * Permission log controller state
 * @property permissionHistory - permission history
 * @property permissionActivityLog - permission activity logs
 */
export type PermissionLogControllerState = {
  permissionHistory: PermissionHistory;
  permissionActivityLog: PermissionActivityLog[];
};

export type PermissionLogControllerOptions = {
  restrictedMethods: Set<string>;
  state?: Partial<PermissionLogControllerState>;
  messenger: PermissionLogControllerMessenger;
};

export type PermissionLogControllerMessenger = RestrictedControllerMessenger<
  typeof name,
  never,
  never,
  never,
  never
>;

const defaultState: PermissionLogControllerState = {
  permissionHistory: {},
  permissionActivityLog: [],
};

const name = 'PermissionLogController';

/**
 * Controller with middleware for logging requests and responses to restricted
 * and permissions-related methods.
 */
export class PermissionLogController extends BaseController<
  typeof name,
  PermissionLogControllerState,
  PermissionLogControllerMessenger
> {
  #restrictedMethods: Set<string>;

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
    this.#restrictedMethods = restrictedMethods;
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
    const newEntries = {
      // TODO: Either fix this lint violation or explain why it's necessary to ignore.
      // eslint-disable-next-line @typescript-eslint/naming-convention
      eth_accounts: {
        accounts: this.#getAccountToTimeMap(accounts, Date.now()),
      },
    };
    this.#commitNewHistory(origin, newEntries);
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
  createMiddleware(): JsonRpcMiddleware<JsonRpcParams, Json> {
    return (req: JsonRpcRequestWithOrigin, res, next) => {
      const { origin, method } = req;
      const isInternal = method.startsWith(WALLET_PREFIX);
      const isEthRequestAccounts = method === 'eth_requestAccounts';

      // Determine if the method should be logged
      if (
        (!LOG_IGNORE_METHODS.includes(method) &&
          (isInternal || this.#restrictedMethods.has(method))) ||
        isEthRequestAccounts
      ) {
        const activityEntry = this.#logRequest(req, isInternal);

        const requestedMethods = this.#getRequestedMethods(req);

        // Call next with a return handler for capturing the response
        next((cb) => {
          const time = Date.now();
          this.#logResponse(activityEntry, res, time);

          if (requestedMethods && !res.error && res.result && origin) {
            this.#logPermissionsHistory(
              requestedMethods,
              origin,
              res.result,
              time,
              isEthRequestAccounts,
            );
          }
          cb();
        });
        return;
      }

      next();
    };
  }

  /**
   * Get a map from account addresses to the given time.
   *
   * @param accounts - An array of addresses.
   * @param time - A time, e.g. Date.now().
   * @returns A string:number map of addresses to time.
   */
  #getAccountToTimeMap(
    accounts: string[],
    time: number,
  ): Record<string, number> {
    return accounts.reduce(
      (acc, account) => ({
        ...acc,
        [account]: time,
      }),
      {},
    );
  }

  /**
   * Creates and commits an activity log entry, without response data.
   *
   * @param request - The request object.
   * @param isInternal - Whether the request is internal.
   * @returns new added activity entry
   */
  #logRequest(
    request: JsonRpcRequestWithOrigin,
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
    this.update((state) => {
      const newLogs = [...state.permissionActivityLog, activityEntry];
      state.permissionActivityLog =
        // remove oldest log if exceeding size limit
        newLogs.length > LOG_LIMIT ? newLogs.slice(1) : newLogs;
    });
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
  #logResponse(
    entry: PermissionActivityLog,
    response: PendingJsonRpcResponse<Json>,
    time: number,
  ) {
    if (!entry || !response) {
      return;
    }

    // The JSON-RPC 2.0 specification defines "success" by the presence of
    // either the "result" or "error" property. The specification forbids
    // both properties from being present simultaneously, and our JSON-RPC
    // stack is spec-compliant at the time of writing.
    this.update((state) => {
      state.permissionActivityLog = state.permissionActivityLog.map((log) => {
        // Update the log entry that matches the given entry id
        if (log.id === entry.id) {
          return {
            ...log,
            success: hasProperty(response, 'result'),
            responseTime: time,
          };
        }
        return log;
      });
    });
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
  #logPermissionsHistory(
    requestedMethods: string[],
    origin: string,
    result: Json,
    time: number,
    isEthRequestAccounts: boolean,
  ) {
    let newEntries: PermissionEntry;

    if (isEthRequestAccounts) {
      // Type assertion: We are assuming that the response data contains
      // a set of accounts if the RPC method is "eth_requestAccounts".
      const accounts = result as string[];
      newEntries = {
        // TODO: Either fix this lint violation or explain why it's necessary to ignore.
        // eslint-disable-next-line @typescript-eslint/naming-convention
        eth_accounts: {
          accounts: this.#getAccountToTimeMap(accounts, time),
          lastApproved: time,
        },
      };
    } else {
      // Records new "lastApproved" times for the granted permissions, if any.
      // Special handling for eth_accounts, in order to record the time the
      // accounts were last seen or approved by the origin.
      // Type assertion: We are assuming that the response data contains
      // a set of permissions if the RPC method is "eth_requestPermissions".
      const permissions = result as Permission[];
      newEntries = permissions.reduce((acc: PermissionEntry, permission) => {
        const method = permission.parentCapability;

        if (!requestedMethods.includes(method)) {
          return acc;
        }

        if (method === 'eth_accounts') {
          const accounts = this.#getAccountsFromPermission(permission);
          return {
            ...acc,
            [method]: {
              lastApproved: time,
              accounts: this.#getAccountToTimeMap(accounts, time),
            },
          };
        }

        return {
          ...acc,
          [method]: {
            lastApproved: time,
          },
        };
      }, {});
    }

    if (Object.keys(newEntries).length > 0) {
      this.#commitNewHistory(origin, newEntries);
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
  #commitNewHistory(origin: string, newEntries: PermissionEntry) {
    const { permissionHistory } = this.state;

    // a simple merge updates most permissions
    const oldOriginHistory = permissionHistory[origin] ?? {};
    const newOriginHistory = {
      ...oldOriginHistory,
      ...newEntries,
    };

    // eth_accounts requires special handling, because of information
    // we store about the accounts
    const existingEthAccountsEntry = oldOriginHistory.eth_accounts;
    const newEthAccountsEntry = newEntries.eth_accounts;

    if (existingEthAccountsEntry && newEthAccountsEntry) {
      // we may intend to update just the accounts, not the permission
      // itself
      const lastApproved =
        newEthAccountsEntry.lastApproved ??
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

    this.update((state) => {
      state.permissionHistory = {
        ...permissionHistory,
        [origin]: newOriginHistory,
      };
    });
  }

  /**
   * Get all requested methods from a permissions request.
   *
   * @param request - The request object.
   * @returns The names of the requested permissions.
   */
  #getRequestedMethods(request: JsonRpcRequestWithOrigin): string[] | null {
    const { method, params } = request;
    if (method === 'eth_requestAccounts') {
      return ['eth_accounts'];
    } else if (
      method === `${WALLET_PREFIX}requestPermissions` &&
      params &&
      Array.isArray(params) &&
      params[0] &&
      typeof params[0] === 'object' &&
      !Array.isArray(params[0])
    ) {
      return Object.keys(params[0]);
    }
    return null;
  }

  /**
   * Get the permitted accounts from an eth_accounts permissions object.
   * Returns an empty array if the permission is not eth_accounts.
   *
   * @param permission - The permissions object.
   * @param permission.parentCapability - The permissions parentCapability.
   * @param permission.caveats - The permissions caveats.
   * @returns The permitted accounts.
   */
  #getAccountsFromPermission(permission: Permission): string[] {
    if (permission.parentCapability !== 'eth_accounts' || !permission.caveats) {
      return [];
    }

    const accounts = new Set<string>();
    for (const caveat of permission.caveats) {
      if (
        caveat.type === CAVEAT_TYPES.restrictReturnedAccounts &&
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
