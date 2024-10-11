import type { NetworkClientId } from '@metamask/network-controller';
import type {
  PermissionSpecificationBuilder,
  EndowmentGetterParams,
  ValidPermissionSpecification,
  PermissionValidatorConstraint,
  PermissionConstraint,
} from '@metamask/permission-controller';
import {
  CaveatMutatorOperation,
  PermissionType,
  SubjectType,
} from '@metamask/permission-controller';
import type { CaipAccountId, Json } from '@metamask/utils';
import {
  parseCaipAccountId,
  type Hex,
  type NonEmptyArray,
} from '@metamask/utils';
import { strict as assert } from 'assert';
import { cloneDeep, isEqual } from 'lodash';

import { assertScopesSupported } from './scope/assert';
import { validateAndFlattenScopes } from './scope/authorization';
import type {
  ExternalScopeString,
  ScopeObject,
  ScopesObject,
} from './scope/scope';

export type Caip25CaveatValue = {
  requiredScopes: ScopesObject;
  optionalScopes: ScopesObject;
  sessionProperties?: Record<string, Json>;
  isMultichainOrigin: boolean;
};

export const Caip25CaveatType = 'authorizedScopes';

export const Caip25CaveatFactoryFn = (value: Caip25CaveatValue) => {
  return {
    type: Caip25CaveatType,
    value,
  };
};

export const Caip25EndowmentPermissionName = 'endowment:caip25';

type Caip25EndowmentSpecification = ValidPermissionSpecification<{
  permissionType: PermissionType.Endowment;
  targetName: typeof Caip25EndowmentPermissionName;
  endowmentGetter: (_options?: EndowmentGetterParams) => null;
  validator: PermissionValidatorConstraint;
  allowedCaveats: Readonly<NonEmptyArray<string>> | null;
}>;

/**
 * `endowment:caip25` returns nothing atm;
 *
 * @param builderOptions - The specification builder options.
 * @param builderOptions.findNetworkClientIdByChainId - The hook to find the networkClientId for a chainId.
 * @returns The specification for the `caip25` endowment.
 */
const specificationBuilder: PermissionSpecificationBuilder<
  PermissionType.Endowment,
  // TODO: FIX THIS
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  any,
  Caip25EndowmentSpecification
> = ({
  findNetworkClientIdByChainId,
}: {
  findNetworkClientIdByChainId: (chainId: Hex) => NetworkClientId;
}) => {
  return {
    permissionType: PermissionType.Endowment,
    targetName: Caip25EndowmentPermissionName,
    allowedCaveats: [Caip25CaveatType],
    endowmentGetter: (_getterOptions?: EndowmentGetterParams) => null,
    subjectTypes: [SubjectType.Website],
    validator: (permission: PermissionConstraint) => {
      const caip25Caveat = permission.caveats?.[0];
      if (
        permission.caveats?.length !== 1 ||
        caip25Caveat?.type !== Caip25CaveatType
      ) {
        throw new Error(
          `${Caip25EndowmentPermissionName} error: Invalid caveats. There must be a single caveat of type "${Caip25CaveatType}".`,
        );
      }

      // TODO: FIX THIS TYPE
      const { requiredScopes, optionalScopes, isMultichainOrigin } = (
        caip25Caveat as unknown as { value: Caip25CaveatValue }
      ).value;

      if (
        !requiredScopes ||
        !optionalScopes ||
        typeof isMultichainOrigin !== 'boolean'
      ) {
        throw new Error(
          `${Caip25EndowmentPermissionName} error: Received invalid value for caveat of type "${Caip25CaveatType}".`,
        );
      }

      const { flattenedRequiredScopes, flattenedOptionalScopes } =
        validateAndFlattenScopes(requiredScopes, optionalScopes);

      const isChainIdSupported = (chainId: Hex) => {
        try {
          findNetworkClientIdByChainId(chainId);
          return true;
        } catch (err) {
          return false;
        }
      };

      assertScopesSupported(flattenedRequiredScopes, {
        isChainIdSupported,
      });
      assertScopesSupported(flattenedOptionalScopes, {
        isChainIdSupported,
      });

      assert.deepEqual(requiredScopes, flattenedRequiredScopes);
      assert.deepEqual(optionalScopes, flattenedOptionalScopes);
    },
  };
};

export const caip25EndowmentBuilder = Object.freeze({
  targetName: Caip25EndowmentPermissionName,
  specificationBuilder,
} as const);

/**
 * Factories that construct caveat mutator functions that are passed to
 * PermissionController.updatePermissionsByCaveat.
 */
export const Caip25CaveatMutatorFactories = {
  [Caip25CaveatType]: {
    removeScope,
    removeAccount,
  },
};

const reduceKeysHelper = <Key extends string, Value>(
  acc: Record<Key, Value>,
  [key, value]: [Key, Value],
) => {
  return {
    ...acc,
    [key]: value,
  };
};

/**
 * Removes the account from the scope object.
 *
 * @param targetAddress - The address to remove from the scope object.
 * @returns A function that removes the account from the scope object.
 */
function removeAccountFilterFn(targetAddress: string) {
  return (account: CaipAccountId) => {
    const parsed = parseCaipAccountId(account);
    return parsed.address !== targetAddress;
  };
}

/**
 * Removes the account from the scope object.
 *
 * @param targetAddress - The address to remove from the scope object.
 * @param scopeObject - The scope object to remove the account from.
 */
function removeAccountOnScope(targetAddress: string, scopeObject: ScopeObject) {
  if (scopeObject.accounts) {
    scopeObject.accounts = scopeObject.accounts.filter(
      removeAccountFilterFn(targetAddress),
    );
  }
}

/**
 * Removes the target account from the scope object.
 *
 * @param targetAddress - The address to remove from the scope object.
 * @param existingScopes - The scope object to remove the account from.
 * @returns The updated scope object.
 */
function removeAccount(
  targetAddress: string, // non caip-10 formatted address
  existingScopes: Caip25CaveatValue,
) {
  // copy existing scopes
  const copyOfExistingScopes = cloneDeep(existingScopes);

  [
    copyOfExistingScopes.requiredScopes,
    copyOfExistingScopes.optionalScopes,
  ].forEach((scopes) => {
    Object.entries(scopes).forEach(([, scopeObject]) => {
      removeAccountOnScope(targetAddress, scopeObject);
    });
  });

  // deep equal check for changes
  const noChange = isEqual(copyOfExistingScopes, existingScopes);

  if (noChange) {
    return {
      operation: CaveatMutatorOperation.Noop,
    };
  }

  return {
    operation: CaveatMutatorOperation.UpdateValue,
    value: copyOfExistingScopes,
  };
}

/**
 * Removes the target account from the value arrays of all
 * `endowment:caip25` caveats. No-ops if the target scopeString is not in
 * the existing scopes,.
 *
 * @param targetScopeString - The scope that is being removed.
 * @param caip25CaveatValue - The CAIP-25 permission caveat value to remove the scope from.
 * @returns The updated CAIP-25 permission caveat value.
 */
export function removeScope(
  targetScopeString: ExternalScopeString,
  caip25CaveatValue: Caip25CaveatValue,
) {
  const newRequiredScopes = Object.entries(
    caip25CaveatValue.requiredScopes,
  ).filter(([scope]) => scope !== targetScopeString);
  const newOptionalScopes = Object.entries(
    caip25CaveatValue.optionalScopes,
  ).filter(([scope]) => {
    return scope !== targetScopeString;
  });

  const requiredScopesRemoved =
    newRequiredScopes.length !==
    Object.keys(caip25CaveatValue.requiredScopes).length;
  const optionalScopesRemoved =
    newOptionalScopes.length !==
    Object.keys(caip25CaveatValue.optionalScopes).length;

  if (requiredScopesRemoved) {
    return {
      operation: CaveatMutatorOperation.RevokePermission,
    };
  }

  if (optionalScopesRemoved) {
    return {
      operation: CaveatMutatorOperation.UpdateValue,
      value: {
        requiredScopes: newRequiredScopes.reduce(reduceKeysHelper, {}),
        optionalScopes: newOptionalScopes.reduce(reduceKeysHelper, {}),
      },
    };
  }

  return {
    operation: CaveatMutatorOperation.Noop,
  };
}
