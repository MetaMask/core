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
  hasProperty,
  parseCaipAccountId,
  type Hex,
  type NonEmptyArray,
} from '@metamask/utils';
import { cloneDeep, isEqual } from 'lodash';

import { getEthAccounts } from './adapters/caip-permission-adapter-eth-accounts';
import {
  assertScopesSupported,
  assertIsExternalScopesObject,
} from './scope/assert';
import { validateAndNormalizeScopes } from './scope/authorization';
import {
  parseScopeString,
  type ExternalScopeString,
  type InternalScopeObject,
  type InternalScopesObject,
  type NormalizedScopeObject,
} from './scope/types';
import { isSupportedScopeString } from './scope/supported';
import { Caip25Errors } from './scope/errors';


// This really isn't a "caip25" permission anymore

// Bad name

/**
 * The CAIP-25 permission caveat value.
 * This permission contains the required and optional scopes and session properties from the [CAIP-25](https://github.com/ChainAgnostic/CAIPs/blob/main/CAIPs/caip-25.md) request that initiated the permission session.
 * It also contains a boolean (isMultichainOrigin) indicating if the permission session is multichain, which may be needed to determine implicit permissioning.
 */
export type Caip25CaveatValue = {
  requiredScopes: InternalScopesObject;
  optionalScopes: InternalScopesObject;
  sessionProperties?: Record<string, Json>;
  isMultichainOrigin: boolean;
};

/**
 * The name of the CAIP-25 permission caveat.
 */
export const Caip25CaveatType = 'authorizedScopes';

/**
 * Creates a CAIP-25 permission caveat.
 * @param value - The CAIP-25 permission caveat value.
 * @returns The CAIP-25 permission caveat (now including the type).
 */
export const createCaip25Caveat = (value: Caip25CaveatValue) => {
  return {
    type: Caip25CaveatType,
    value,
  };
};

/**
 * The target name of the CAIP-25 endowment permission.
 */
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

      if (
        !caip25Caveat.value ||
        !hasProperty(caip25Caveat.value, 'requiredScopes') ||
        !hasProperty(caip25Caveat.value, 'optionalScopes') ||
        !hasProperty(caip25Caveat.value, 'isMultichainOrigin') ||
        typeof caip25Caveat.value.isMultichainOrigin !== 'boolean'
      ) {
        throw new Error(
          `${Caip25EndowmentPermissionName} error: Received invalid value for caveat of type "${Caip25CaveatType}".`,
        );
      }

      const requiredScopes = caip25Caveat.value.requiredScopes as InternalScopeObject;
      const optionalScopes = caip25Caveat.value.optionalScopes as InternalScopeObject;

      // TODO: Add assertion to types
      // const { requiredScopes, optionalScopes } = caip25Caveat.value;

      // assertIsExternalScopesObject(requiredScopes);
      // assertIsExternalScopesObject(optionalScopes);

      // const { normalizedRequiredScopes, normalizedOptionalScopes } =
      //   validateAndNormalizeScopes(requiredScopes, optionalScopes);

      const isChainIdSupported = (chainId: Hex) => {
        try {
          methodHooks.findNetworkClientIdByChainId(chainId);
          return true;
        } catch (err) {
          return false;
        }
      };

      Object.keys(requiredScopes).forEach((scopeString) => {
        if (!isSupportedScopeString(scopeString, isChainIdSupported)) {
          throw Caip25Errors.requestedChainsNotSupportedError();
        }
      })

      // assertScopesSupported(normalizedRequiredScopes, {
      //   isChainIdSupported,
      // });
      // assertScopesSupported(normalizedOptionalScopes, {
      //   isChainIdSupported,
      // });

      // Fetch EVM accounts from native wallet keyring
      // These addresses are lowercased already
      const existingEvmAddresses = methodHooks
        .listAccounts()
        .map((account) => account.address);
      const ethAccounts = getEthAccounts({
        requiredScopes,
        optionalScopes,
      }).map((address) => address.toLowerCase() as Hex);

      const allEthAccountsSupported = ethAccounts.every((address) =>
        existingEvmAddresses.includes(address),
      );
      if (!allEthAccountsSupported) {
        throw new Error(
          `${Caip25EndowmentPermissionName} error: Received eip155 account value(s) for caveat of type "${Caip25CaveatType}" that were not found in the wallet keyring.`,
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
  scopeObject: InternalScopeObject,
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
 * @param caip25CaveatValue - The CAIP-25 permission caveat value from which to remove the account (across all chain scopes).
 * @param targetAddress - The address to remove from the scope object. Not a CAIP-10 formatted address because it will be removed across each chain scope.
 * @returns The updated scope object.
 */
function removeAccount(
  caip25CaveatValue: Caip25CaveatValue,
  targetAddress: Hex,
) {
  const copyOfCaveatValue = cloneDeep(caip25CaveatValue);

  [copyOfCaveatValue.requiredScopes, copyOfCaveatValue.optionalScopes].forEach(
    (scopes) => {
      Object.entries(scopes).forEach(([, scopeObject]) => {
        removeAccountFromScopeObject(scopeObject, targetAddress);
      });
    },
  );

  const noChange = isEqual(copyOfCaveatValue, caip25CaveatValue);

  if (noChange) {
    return {
      operation: CaveatMutatorOperation.Noop,
    };
  }

  return {
    operation: CaveatMutatorOperation.UpdateValue,
    value: copyOfCaveatValue,
  };
}

/**
 * Removes the target account from the value arrays of the given
 * `endowment:caip25` caveat. No-ops if the target scopeString is not in
 * the existing scopes.
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
