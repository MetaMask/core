import { type Json, JsonRpcRequestStruct } from '@metamask/utils';
import deepFreeze from 'deep-freeze-strict';

import { CAVEAT_TYPES } from '../src/enums';

/**
 * This file contains mocks for the PermissionLogController tests.
 */

export const noop = () => undefined;

const keyringAccounts = deepFreeze([
  '0x0dcd5d886577d5081b0c52e242ef29e70be3e7bc',
  '0xc42edfcc21ed14dda456aa0756c153f7985d8813',
  '0x7ae1cdd37bcbdb0e1f491974da8022bfdbf9c2bf',
  '0xcc74c7a59194e5d9268476955650d1e285be703c',
]);

const SUBJECTS = {
  a: { origin: 'https://foo.xyz' },
  b: { origin: 'https://bar.abc' },
  c: { origin: 'https://baz.def' },
};

const PERM_NAMES = Object.freeze({
  // TODO: Either fix this lint violation or explain why it's necessary to ignore.
  // eslint-disable-next-line @typescript-eslint/naming-convention
  eth_accounts: 'eth_accounts',
  // TODO: Either fix this lint violation or explain why it's necessary to ignore.
  // eslint-disable-next-line @typescript-eslint/naming-convention
  test_method: 'test_method',
  // TODO: Either fix this lint violation or explain why it's necessary to ignore.
  // eslint-disable-next-line @typescript-eslint/naming-convention
  does_not_exist: 'does_not_exist',
});

const ACCOUNTS = {
  a: {
    permitted: keyringAccounts.slice(0, 3),
    primary: keyringAccounts[0],
  },
  b: {
    permitted: [keyringAccounts[0]],
    primary: keyringAccounts[0],
  },
  c: {
    permitted: [keyringAccounts[1]],
    primary: keyringAccounts[1],
  },
};

/**
 * Helpers for getting mock caveats.
 */
const CAVEATS = {
  /**
   * Gets a correctly formatted eth_accounts restrictReturnedAccounts caveat.
   *
   * @param accounts - The accounts for the caveat
   * @returns An eth_accounts restrictReturnedAccounts caveats
   */
  // TODO: Either fix this lint violation or explain why it's necessary to ignore.
  // eslint-disable-next-line @typescript-eslint/naming-convention
  eth_accounts: (accounts: string[]) => {
    return [
      {
        type: CAVEAT_TYPES.restrictReturnedAccounts,
        value: accounts,
      },
    ];
  },
};

/**
 * Each function here corresponds to what would be a type or interface consumed
 * by permissions controller functions if we used TypeScript.
 */
const PERMS = {
  /**
   * Requested permissions objects, as passed to wallet_requestPermissions.
   */
  requests: {
    /**
     * eth_accounts
     *
     * @returns A permissions request object with eth_accounts
     */
    // TODO: Either fix this lint violation or explain why it's necessary to ignore.
    // eslint-disable-next-line @typescript-eslint/naming-convention
    eth_accounts: () => {
      // TODO: Either fix this lint violation or explain why it's necessary to ignore.
      // eslint-disable-next-line @typescript-eslint/naming-convention
      return { eth_accounts: {} };
    },

    /**
     * test_method
     *
     * @returns A permissions request object with test_method
     */
    // TODO: Either fix this lint violation or explain why it's necessary to ignore.
    // eslint-disable-next-line @typescript-eslint/naming-convention
    test_method: () => {
      // TODO: Either fix this lint violation or explain why it's necessary to ignore.
      // eslint-disable-next-line @typescript-eslint/naming-convention
      return { test_method: {} };
    },

    /**
     * does_not_exist
     *
     * @returns A permissions request object with does_not_exist
     */
    // TODO: Either fix this lint violation or explain why it's necessary to ignore.
    // eslint-disable-next-line @typescript-eslint/naming-convention
    does_not_exist: () => {
      // TODO: Either fix this lint violation or explain why it's necessary to ignore.
      // eslint-disable-next-line @typescript-eslint/naming-convention
      return { does_not_exist: {} };
    },
  },

  /**
   * Partial members of res.result for successful:
   * - wallet_requestPermissions
   * - wallet_getPermissions
   */
  granted: {
    /**
     * eth_accounts
     *
     * @param accounts - The accounts for the eth_accounts permission caveat
     * @returns A granted permissions object with eth_accounts and its caveat
     */
    // TODO: Either fix this lint violation or explain why it's necessary to ignore.
    // eslint-disable-next-line @typescript-eslint/naming-convention
    eth_accounts: (accounts: string[]) => {
      return {
        parentCapability: PERM_NAMES.eth_accounts,
        caveats: CAVEATS.eth_accounts(accounts),
      };
    },

    /**
     * test_method
     *
     * @returns A granted permissions object with test_method
     */
    // TODO: Either fix this lint violation or explain why it's necessary to ignore.
    // eslint-disable-next-line @typescript-eslint/naming-convention
    test_method: () => {
      return {
        parentCapability: PERM_NAMES.test_method,
      };
    },
  },
};

/**
 * Objects with function values for getting correctly formatted permissions,
 * caveats, errors, permissions requests etc.
 */
export const getters = deepFreeze({
  PERMS,

  /**
   * Getters for mock RPC request objects.
   */
  RPC_REQUESTS: {
    /**
     * Gets an arbitrary RPC request object.
     *
     * @param origin - The origin of the request
     * @param method - The request method
     * @param [params] - The request parameters
     * @param [id] - The request id
     * @returns An RPC request object
     */
    custom: (origin: string, method: string, params?: Json[], id?: string) => {
      const req = {
        ...JsonRpcRequestStruct.TYPE,
        origin,
        method,
        params: params ?? [],
        id: id ?? null,
      };
      return req;
    },

    /**
     * Gets an eth_accounts RPC request object.
     *
     * @param origin - The origin of the request
     * @returns An RPC request object
     */
    // TODO: Either fix this lint violation or explain why it's necessary to ignore.
    // eslint-disable-next-line @typescript-eslint/naming-convention
    eth_accounts: (origin: string) => {
      return {
        ...JsonRpcRequestStruct.TYPE,
        origin,
        method: 'eth_accounts',
        params: [],
      };
    },

    /**
     * Gets a test_method RPC request object.
     *
     * @param origin - The origin of the request
     * @param param - The request param
     * @returns An RPC request object
     */
    // TODO: Either fix this lint violation or explain why it's necessary to ignore.
    // eslint-disable-next-line @typescript-eslint/naming-convention
    test_method: (origin: string, param = false) => {
      return {
        ...JsonRpcRequestStruct.TYPE,
        origin,
        method: 'test_method',
        params: [param],
      };
    },

    /**
     * Gets an eth_requestAccounts RPC request object.
     *
     * @param origin - The origin of the request
     * @returns An RPC request object
     */
    // TODO: Either fix this lint violation or explain why it's necessary to ignore.
    // eslint-disable-next-line @typescript-eslint/naming-convention
    eth_requestAccounts: (origin: string) => {
      return {
        ...JsonRpcRequestStruct.TYPE,
        origin,
        method: 'eth_requestAccounts',
        params: [],
      };
    },

    /**
     * Gets a wallet_requestPermissions RPC request object,
     * for a single permission.
     *
     * @param origin - The origin of the request
     * @param permissionName - The name of the permission to request
     * @returns An RPC request object
     */
    requestPermission: (
      origin: string,
      permissionName: 'eth_accounts' | 'test_method' | 'does_not_exist',
    ) => {
      return {
        ...JsonRpcRequestStruct.TYPE,
        origin,
        method: 'wallet_requestPermissions',
        params: [PERMS.requests[permissionName]()],
      };
    },

    /**
     * Gets a wallet_requestPermissions RPC request object,
     * for multiple permissions.
     *
     * @param origin - The origin of the request
     * @param permissions - A permission request object
     * @returns An RPC request object
     */
    requestPermissions: (origin: string, permissions = {}) => {
      return {
        ...JsonRpcRequestStruct.TYPE,
        origin,
        method: 'wallet_requestPermissions',
        params: [permissions],
      };
    },

    /**
     * Gets a metamask_sendDomainMetadata RPC request object.
     *
     * @param origin - The origin of the request
     * @param name - The subjectMetadata name
     * @param args - Any other data for the request's subjectMetadata
     * @returns An RPC request object
     */
    // TODO: Either fix this lint violation or explain why it's necessary to ignore.
    // eslint-disable-next-line @typescript-eslint/naming-convention
    metamask_sendDomainMetadata: (
      origin: string,
      name: string,
      ...args: Json[]
    ) => {
      return {
        ...JsonRpcRequestStruct.TYPE,
        origin,
        method: 'metamask_sendDomainMetadata',
        params: {
          ...args,
          name,
        },
      };
    },
  },
});

/**
 * Objects with immutable mock values.
 */
export const constants = deepFreeze({
  REQUEST_IDS: {
    a: '1',
    b: '2',
    c: '3',
  },

  SUBJECTS: { ...SUBJECTS },

  ACCOUNTS: { ...ACCOUNTS },

  PERM_NAMES: { ...PERM_NAMES },

  /**
   * Mock permissions history objects.
   */
  EXPECTED_HISTORIES: {
    case1: [
      {
        [SUBJECTS.a.origin]: {
          [PERM_NAMES.eth_accounts]: {
            lastApproved: 1,
            accounts: {
              [ACCOUNTS.a.permitted[0]]: 1,
              [ACCOUNTS.a.permitted[1]]: 1,
              [ACCOUNTS.a.permitted[2]]: 1,
            },
          },
        },
      },
      {
        [SUBJECTS.a.origin]: {
          [PERM_NAMES.eth_accounts]: {
            lastApproved: 2,
            accounts: {
              [ACCOUNTS.a.permitted[0]]: 2,
              [ACCOUNTS.a.permitted[1]]: 1,
              [ACCOUNTS.a.permitted[2]]: 1,
            },
          },
        },
      },
    ],

    case2: [
      {
        [SUBJECTS.a.origin]: {
          [PERM_NAMES.eth_accounts]: {
            lastApproved: 1,
            accounts: {},
          },
        },
      },
    ],

    case3: [
      {
        [SUBJECTS.a.origin]: {
          [PERM_NAMES.test_method]: { lastApproved: 1 },
        },
        [SUBJECTS.b.origin]: {
          [PERM_NAMES.eth_accounts]: {
            lastApproved: 1,
            accounts: {
              [ACCOUNTS.b.permitted[0]]: 1,
            },
          },
        },
        [SUBJECTS.c.origin]: {
          [PERM_NAMES.test_method]: { lastApproved: 1 },
          [PERM_NAMES.eth_accounts]: {
            lastApproved: 1,
            accounts: {
              [ACCOUNTS.c.permitted[0]]: 1,
            },
          },
        },
      },
      {
        [SUBJECTS.a.origin]: {
          [PERM_NAMES.test_method]: { lastApproved: 2 },
        },
        [SUBJECTS.b.origin]: {
          [PERM_NAMES.eth_accounts]: {
            lastApproved: 1,
            accounts: {
              [ACCOUNTS.b.permitted[0]]: 1,
            },
          },
        },
        [SUBJECTS.c.origin]: {
          [PERM_NAMES.test_method]: { lastApproved: 1 },
          [PERM_NAMES.eth_accounts]: {
            lastApproved: 2,
            accounts: {
              [ACCOUNTS.c.permitted[0]]: 1,
              [ACCOUNTS.b.permitted[0]]: 2,
            },
          },
        },
      },
    ],

    case4: [
      {
        [SUBJECTS.a.origin]: {
          [PERM_NAMES.test_method]: {
            lastApproved: 1,
          },
        },
      },
    ],
  },
});
