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
} from '@metamask/permission-controller';
import type { CaipAccountId, Json } from '@metamask/utils';
import {
  parseCaipAccountId,
  type Hex,
  type NonEmptyArray,
} from '@metamask/utils';
import { cloneDeep, isEqual } from 'lodash';

import { getEthAccounts } from './adapters/caip-permission-adapter-eth-accounts';
import { assertScopesSupported } from './scope/assert';
import { validateAndNormalizeScopes } from './scope/authorization';
import type {
  ExternalScopeString,
  ScopeObject,
  ScopesObject,
} from './scope/types';

export type Caip25CaveatValue = {
  requiredScopes: ScopesObject;
  optionalScopes: ScopesObject;
  sessionProperties?: Record<string, Json>;
  isMultichainOrigin: boolean;
};

export const Caip25CaveatType = 'authorizedScopes';

export const createCaip25Caveat = (value: Caip25CaveatValue) => {
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

type Caip25EndowmentSpecificationBuilderOptions = {
  methodHooks: {
    findNetworkClientIdByChainId: (chainId: Hex) => NetworkClientId;
    listAccounts: () => { address: Hex }[];
  };
};

/**
 * Helper that returns a `endowment:caip25` specification that
 * can be passed into the PermissionController constructor.
 *
 * @param builderOptions - The specification builder options.
 * @param builderOptions.methodHooks - The RPC method hooks needed by the method implementation.
 * @returns The specification for the `caip25` endowment.
 */
const specificationBuilder: PermissionSpecificationBuilder<
  PermissionType.Endowment,
  Caip25EndowmentSpecificationBuilderOptions,
  Caip25EndowmentSpecification
> = ({ methodHooks }: Caip25EndowmentSpecificationBuilderOptions) => {
  return {
    permissionType: PermissionType.Endowment,
    targetName: Caip25EndowmentPermissionName,
    allowedCaveats: [Caip25CaveatType],
    endowmentGetter: (_getterOptions?: EndowmentGetterParams) => null,
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

      const { requiredScopes, optionalScopes, isMultichainOrigin } =
        caip25Caveat.value as Caip25CaveatValue;

      if (
        !requiredScopes ||
        !optionalScopes ||
        typeof isMultichainOrigin !== 'boolean'
      ) {
        throw new Error(
          `${Caip25EndowmentPermissionName} error: Received invalid value for caveat of type "${Caip25CaveatType}".`,
        );
      }

      const { normalizedRequiredScopes, normalizedOptionalScopes } =
        validateAndNormalizeScopes(requiredScopes, optionalScopes);

      const isChainIdSupported = (chainId: Hex) => {
        try {
          methodHooks.findNetworkClientIdByChainId(chainId);
          return true;
        } catch (err) {
          return false;
        }
      };

      assertScopesSupported(normalizedRequiredScopes, {
        isChainIdSupported,
      });
      assertScopesSupported(normalizedOptionalScopes, {
        isChainIdSupported,
      });

      // Fetch EVM accounts from native wallet keyring
      // These addresses are lowercased already
      const existingEvmAddresses = methodHooks
        .listAccounts()
        .map((account) => account.address);
      const ethAccounts = getEthAccounts({
        requiredScopes: normalizedRequiredScopes,
        optionalScopes: normalizedOptionalScopes,
      }).map((address) => address.toLowerCase() as Hex);

      const allEthAccountsSupported = ethAccounts.every((address) =>
        existingEvmAddresses.includes(address),
      );
      if (!allEthAccountsSupported) {
        throw new Error(
          `${Caip25EndowmentPermissionName} error: Received eip155 account value(s) for caveat of type "${Caip25CaveatType}" that were not found in the wallet keyring.`,
        );
      }

      if (
        !isEqual(requiredScopes, normalizedRequiredScopes) ||
        !isEqual(optionalScopes, normalizedOptionalScopes)
      ) {
        throw new Error(
          `${Caip25EndowmentPermissionName} error: Received non-normalized value for caveat of type "${Caip25CaveatType}".`,
        );
      }
    },
  };
};

/**
 * The `caip25` endowment specification builder. Passed to the
 * `PermissionController` for constructing and validating the
 * `endowment:caip25` permission.
 */
export const caip25EndowmentBuilder = Object.freeze({
  targetName: Caip25EndowmentPermissionName,
  specificationBuilder,
} as const);

/**
 * Factories that construct caveat mutator functions that are passed to
 * PermissionController.updatePermissionsByCaveat.
 */
export const Caip25CaveatMutators = {
  [Caip25CaveatType]: {
    removeScope,
    removeAccount,
  },
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
 * @param scopeObject - The scope object to remove the account from.
 * @param targetAddress - The address to remove from the scope object.
 */
function removeAccountFromScopeObject(
  scopeObject: ScopeObject,
  targetAddress: string,
) {
  if (scopeObject.accounts) {
    scopeObject.accounts = scopeObject.accounts.filter(
      removeAccountFilterFn(targetAddress),
    );
  }
}

/**
 * Removes the target account from the scope object.
 *
 * @param existingScopes - The scope object to remove the account from.
 * @param targetAddress - The address to remove from the scope object. Not a CAIP-10 formatted address because it will be removed across each chain scope.
 * @returns The updated scope object.
 */
function removeAccount(
  existingScopes: Caip25CaveatValue,
  targetAddress: string,
) {
  const copyOfExistingScopes = cloneDeep(existingScopes);

  [
    copyOfExistingScopes.requiredScopes,
    copyOfExistingScopes.optionalScopes,
  ].forEach((scopes) => {
    Object.entries(scopes).forEach(([, scopeObject]) => {
      removeAccountFromScopeObject(scopeObject, targetAddress);
    });
  });

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
 * @param caip25CaveatValue - The CAIP-25 permission caveat value to remove the scope from.
 * @param targetScopeString - The scope that is being removed.
 * @returns The updated CAIP-25 permission caveat value.
 */
function removeScope(
  caip25CaveatValue: Caip25CaveatValue,
  targetScopeString: ExternalScopeString,
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

  if (requiredScopesRemoved || optionalScopesRemoved) {
    return {
      operation: CaveatMutatorOperation.UpdateValue,
      value: {
        requiredScopes: Object.fromEntries(newRequiredScopes),
        optionalScopes: Object.fromEntries(newOptionalScopes),
      },
    };
  }

  return {
    operation: CaveatMutatorOperation.Noop,
  };
}
