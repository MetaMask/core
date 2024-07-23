import {
  type CaveatSpecificationMap,
  type CaveatValidator,
  type PermissionConstraint,
  type PermissionFactory,
  type PermissionOptions,
  type PermissionSpecificationMap,
  PermissionType,
  type RestrictedMethod,
  type RestrictedMethodOptions,
  constructPermission,
} from '@metamask/permission-controller';
import { hasProperty, type Hex } from '@metamask/utils';

declare const CaveatTypes: {
  readonly restrictReturnedAccounts: 'restrictReturnedAccounts';
};

export const RestrictedMethods = {
  // These properties match RPC method names, which follow a different naming convention
  /* eslint-disable @typescript-eslint/naming-convention */
  eth_accounts: 'eth_accounts',
  /* eslint-enable @typescript-eslint/naming-convention */
} as const;

type DefaultCaveats = {
  restrictReturnedAccounts: {
    type: typeof CaveatTypes.restrictReturnedAccounts;

    value: Hex[];
  };
};

export type DefaultCaveatSpecification = {
  type: typeof CaveatTypes.restrictReturnedAccounts;

  decorator: (
    method: (args: RestrictedMethodOptions<null>) => Promise<Hex[]>,
    caveat: DefaultCaveats['restrictReturnedAccounts'],
  ) => (args: RestrictedMethodOptions<null>) => Promise<Hex[]>;

  merger: (leftValue: Hex[], rightValue: Hex[]) => [] | [Hex[], Hex[]];

  validator: CaveatValidator<DefaultCaveats['restrictReturnedAccounts']>;
};

/**
 * Validates the accounts associated with a caveat. In essence, ensures that
 * the accounts value is an array of non-empty strings, and that each string
 * corresponds to a PreferencesController identity.
 *
 * @param caveatAccounts - The accounts associated with the caveat.
 * @param getAccounts - Returns a list of all wallet accounts.
 */
function validateCaveatAccounts(
  caveatAccounts: unknown,
  getAccounts: () => Hex[],
) {
  if (!Array.isArray(caveatAccounts) || caveatAccounts.length === 0) {
    throw new Error(
      `${RestrictedMethods.eth_accounts} error: Expected non-empty array of Ethereum addresses.`,
    );
  }

  const accounts = getAccounts();
  caveatAccounts.forEach((address) => {
    if (!address || typeof address !== 'string') {
      throw new Error(
        `${
          RestrictedMethods.eth_accounts
        } error: Expected an array of Ethereum addresses. Received: "${
          typeof address === 'string' ? address : `typeof ${typeof address}`
        }".`,
      );
    }

    if (
      !accounts.some(
        (account) => account.toLowerCase() === address.toLowerCase(),
      )
    ) {
      throw new Error(
        `${RestrictedMethods.eth_accounts} error: Received unrecognized address: "${address}".`,
      );
    }
  });
}

/**
 * Factory functions for all default caveat types.
 */
export const CaveatFactories = Object.freeze({
  [CaveatTypes.restrictReturnedAccounts]: (accounts: Hex[]) => {
    return { type: CaveatTypes.restrictReturnedAccounts, value: accounts };
  },
});

/**
 * Get the specifications for all default caveats used by the PermissionController.
 *
 * @param options - Options.
 * @param options.getAccounts - Returns a list of all wallet accounts.
 * @returns All default caveat specifications.
 */
export function getDefaultCaveatSpecifications({
  getAccounts,
}: {
  getAccounts: () => Hex[];
}): CaveatSpecificationMap<DefaultCaveatSpecification> {
  return {
    [CaveatTypes.restrictReturnedAccounts]: {
      type: CaveatTypes.restrictReturnedAccounts,

      decorator: (
        method: (args: RestrictedMethodOptions<null>) => Promise<Hex[]>,
        caveat: DefaultCaveats['restrictReturnedAccounts'],
      ) => {
        return async (args: RestrictedMethodOptions<null>) => {
          const result = await method(args);
          return result.filter((account: Hex) =>
            caveat.value.includes(account),
          );
        };
      },

      merger: (leftValue: Hex[], rightValue: Hex[]) => {
        const newValue = Array.from(new Set([...leftValue, ...rightValue]));
        const diff = newValue.filter((value) => !leftValue.includes(value));
        return [newValue, diff];
      },

      validator: (
        caveat: {
          type: typeof CaveatTypes.restrictReturnedAccounts;
          value: unknown;
        },
        _origin?: string,
        _target?: string,
      ) => validateCaveatAccounts(caveat.value, getAccounts),
    },
  };
}

type DefaultPermissions = {
  [RestrictedMethods.eth_accounts]: {
    caveats: [DefaultCaveats['restrictReturnedAccounts']];
    date: number;
    id: string;
    invoker: string;
    parentCapability: typeof RestrictedMethods.eth_accounts;
  };
};

export type DefaultPermissionSpecification = {
  permissionType: PermissionType.RestrictedMethod;
  targetName: typeof RestrictedMethods.eth_accounts;
  allowedCaveats: [typeof CaveatTypes.restrictReturnedAccounts];
  factory: PermissionFactory<
    DefaultPermissions[typeof RestrictedMethods.eth_accounts],
    Record<string, unknown>
  >;
  methodImplementation: RestrictedMethod<[], Hex[]>;
  validator: (
    permission: PermissionConstraint,
    origin?: string,
    target?: string,
  ) => void;
};

/**
 * Get the specifications for all default permissions used by the PermissionController.
 *
 * @param options - Options bag.
 * @param options.getAccounts - Returns a list of all wallet accounts.
 * @returns All default permission specifications.
 */
export function getDefaultPermissionSpecifications({
  getAccounts,
}: {
  getAccounts: () => Hex[];
}): PermissionSpecificationMap<DefaultPermissionSpecification> {
  return {
    [RestrictedMethods.eth_accounts]: {
      permissionType: PermissionType.RestrictedMethod,
      targetName: RestrictedMethods.eth_accounts,
      allowedCaveats: [CaveatTypes.restrictReturnedAccounts],

      factory: (
        permissionOptions: PermissionOptions<
          DefaultPermissions['eth_accounts']
        >,
        requestData?: Record<string, unknown>,
      ) => {
        // This occurs when we use PermissionController.grantPermissions().
        if (requestData === undefined) {
          return constructPermission({
            ...permissionOptions,
          });
        }

        // The approved accounts will be further validated as part of the caveat.
        if (!hasProperty(requestData, 'approvedAccounts')) {
          throw new Error(
            `${RestrictedMethods.eth_accounts} error: No approved accounts specified.`,
          );
        }
        const { approvedAccounts } = requestData;
        if (!Array.isArray(approvedAccounts)) {
          throw new Error(
            `${
              RestrictedMethods.eth_accounts
            } error: Invalid approved accounts: ${typeof approvedAccounts}`,
          );
        }

        return constructPermission({
          ...permissionOptions,
          caveats: [
            CaveatFactories[CaveatTypes.restrictReturnedAccounts](
              approvedAccounts,
            ),
          ],
        });
      },
      methodImplementation: async () => {
        // TODO: Add sorting by last selected, once AccountsController has been integrated
        return getAccounts();
      },
      validator: (permission, _origin, _target) => {
        const { caveats } = permission;
        if (
          !caveats ||
          caveats.length !== 1 ||
          caveats[0].type !== CaveatTypes.restrictReturnedAccounts
        ) {
          throw new Error(
            `${RestrictedMethods.eth_accounts} error: Invalid caveats. There must be a single caveat of type "${CaveatTypes.restrictReturnedAccounts}".`,
          );
        }
      },
    },
  };
}

/**
 * All default unrestricted methods.
 *
 * Unrestricted methods are ignored by the permission system, but every
 * JSON-RPC request seen by the permission system must correspond to a
 * restricted or unrestricted method, or the request will be rejected with a
 * "method not found" error.
 */
export const defaultUnrestrictedMethods = Object.freeze([
  'eth_coinbase',
  // TODO: implement this middleware
  'eth_requestAccounts',
  'eth_signTypedData',
  'eth_signTypedData_v1',
  'eth_signTypedData_v3',
  'eth_signTypedData_v4',
  'personal_ecRecover',
  'personal_sign',
  'web3_clientVersion',
]);
