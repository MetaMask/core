import type { NetworkClientId } from '@metamask/network-controller';
import type {
  PermissionSpecificationBuilder,
  EndowmentGetterParams,
  ValidPermissionSpecification,
  PermissionValidatorConstraint,
  PermissionConstraint,
  EndowmentCaveatSpecificationConstraint,
  PermissionController,
} from '@metamask/permission-controller';
import {
  CaveatMutatorOperation,
  PermissionType,
} from '@metamask/permission-controller';
import type { CaipAccountId, CaipChainId, Json } from '@metamask/utils';
import {
  hasProperty,
  KnownCaipNamespace,
  parseCaipAccountId,
  isObject,
  type Hex,
  type NonEmptyArray,
} from '@metamask/utils';
import { cloneDeep, isEqual, pick } from 'lodash';

import { CaveatTypes, PermissionKeys } from './constants';
import {
  setEthAccounts,
  setNonSCACaipAccountIdsInCaip25CaveatValue,
} from './operators/caip-permission-operator-accounts';
import {
  setChainIdsInCaip25CaveatValue,
  setPermittedEthChainIds,
} from './operators/caip-permission-operator-permittedChains';
import { assertIsInternalScopesObject } from './scope/assert';
import {
  isSupportedAccount,
  isSupportedScopeString,
  isSupportedSessionProperty,
} from './scope/supported';
import { mergeInternalScopes } from './scope/transform';
import {
  parseScopeString,
  type ExternalScopeString,
  type InternalScopeObject,
  type InternalScopesObject,
} from './scope/types';

/**
 * The CAIP-25 permission caveat value.
 * This permission contains the required and optional scopes and session properties from the [CAIP-25](https://github.com/ChainAgnostic/CAIPs/blob/main/CAIPs/caip-25.md) request that initiated the permission session.
 * It also contains a boolean (isMultichainOrigin) indicating if the permission session is multichain, which may be needed to determine implicit permissioning.
 */
export type Caip25CaveatValue = {
  requiredScopes: InternalScopesObject;
  optionalScopes: InternalScopesObject;
  sessionProperties: Record<string, Json>;
  isMultichainOrigin: boolean;
};

/**
 * The name of the CAIP-25 permission caveat.
 */
export const Caip25CaveatType = 'authorizedScopes';

/**
 * The target name of the CAIP-25 endowment permission.
 */
export const Caip25EndowmentPermissionName = 'endowment:caip25';

/**
 * Creates a CAIP-25 permission caveat.
 *
 * @param value - The CAIP-25 permission caveat value.
 * @returns The CAIP-25 permission caveat (now including the type).
 */
export const createCaip25Caveat = (value: Caip25CaveatValue) => {
  return {
    type: Caip25CaveatType,
    value,
  };
};

type Caip25EndowmentCaveatSpecificationBuilderOptions = {
  findNetworkClientIdByChainId: (chainId: Hex) => NetworkClientId;
  listAccounts: () => { type: string; address: Hex }[];
  isNonEvmScopeSupported: (scope: CaipChainId) => boolean;
  getNonEvmAccountAddresses: (scope: CaipChainId) => string[];
};

/**
 * Calculates the difference between two provided CAIP-25 permission caveat values, but only considering a single scope property at a time.
 *
 * @param originalValue - The existing CAIP-25 permission caveat value.
 * @param mergedValue - The result from merging existing and incoming CAIP-25 permission caveat values.
 * @param scopeToDiff - The required or optional scopes from the [CAIP-25](https://github.com/ChainAgnostic/CAIPs/blob/main/CAIPs/caip-25.md) request.
 * @returns The difference between original and merged CAIP-25 permission caveat values.
 */
export function diffScopesForCaip25CaveatValue(
  originalValue: Caip25CaveatValue,
  mergedValue: Caip25CaveatValue,
  scopeToDiff: 'optionalScopes' | 'requiredScopes',
): Caip25CaveatValue {
  const diff = cloneDeep(originalValue);

  const mergedScopeToDiff = mergedValue[scopeToDiff];
  for (const [scopeString, mergedScopeObject] of Object.entries(
    mergedScopeToDiff,
  )) {
    const internalScopeString = scopeString as keyof typeof mergedScopeToDiff;
    const originalScopeObject = diff[scopeToDiff][internalScopeString];

    if (originalScopeObject) {
      const newAccounts = mergedScopeObject.accounts.filter(
        (account) => !originalScopeObject?.accounts.includes(account),
      );
      if (newAccounts.length > 0) {
        diff[scopeToDiff][internalScopeString] = {
          accounts: newAccounts,
        };
        continue;
      }
      delete diff[scopeToDiff][internalScopeString];
    } else {
      diff[scopeToDiff][internalScopeString] = mergedScopeObject;
    }
  }

  return diff;
}

/**
 * Checks if every account in the given scopes object is supported.
 *
 * @param scopesObject - The scopes object to iterate over.
 * @param listAccounts - The hook for getting internalAccount objects for all evm accounts.
 * @param getNonEvmAccountAddresses - The hook that returns the supported CAIP-10 account addresses for a non EVM scope.
 * addresses.
 * @returns True if every account in the scopes object is supported, false otherwise.
 */
function isEveryAccountInScopesObjectSupported(
  scopesObject: InternalScopesObject,
  listAccounts: () => { type: string; address: Hex }[],
  getNonEvmAccountAddresses: (scope: CaipChainId) => string[],
) {
  return Object.values(scopesObject).every((scopeObject) =>
    scopeObject.accounts.every((account) =>
      isSupportedAccount(account, {
        getEvmInternalAccounts: listAccounts,
        getNonEvmAccountAddresses,
      }),
    ),
  );
}

/**
 * Helper that returns a `authorizedScopes` CAIP-25 caveat specification
 * that can be passed into the PermissionController constructor.
 *
 * @param options - The specification builder options.
 * @param options.findNetworkClientIdByChainId - The hook for getting the networkClientId that serves a chainId.
 * @param options.listAccounts - The hook for getting internalAccount objects for all evm accounts.
 * @param options.isNonEvmScopeSupported - The hook that determines if an non EVM scopeString is supported.
 * @param options.getNonEvmAccountAddresses - The hook that returns the supported CAIP-10 account addresses for a non EVM scope.
 * @returns The specification for the `caip25` caveat.
 */
export const caip25CaveatBuilder = ({
  findNetworkClientIdByChainId,
  listAccounts,
  isNonEvmScopeSupported,
  getNonEvmAccountAddresses,
}: Caip25EndowmentCaveatSpecificationBuilderOptions): EndowmentCaveatSpecificationConstraint &
  Required<
    Pick<EndowmentCaveatSpecificationConstraint, 'validator' | 'merger'>
  > => {
  return {
    type: Caip25CaveatType,
    validator: (
      caveat: { type: typeof Caip25CaveatType; value: unknown },
      _origin?: string,
      _target?: string,
    ) => {
      if (
        !caveat.value ||
        !hasProperty(caveat.value, 'requiredScopes') ||
        !hasProperty(caveat.value, 'optionalScopes') ||
        !hasProperty(caveat.value, 'isMultichainOrigin') ||
        !hasProperty(caveat.value, 'sessionProperties') ||
        typeof caveat.value.isMultichainOrigin !== 'boolean' ||
        !isObject(caveat.value.sessionProperties)
      ) {
        throw new Error(
          `${Caip25EndowmentPermissionName} error: Received invalid value for caveat of type "${Caip25CaveatType}".`,
        );
      }

      const { requiredScopes, optionalScopes, sessionProperties } =
        caveat.value;

      const allSessionPropertiesSupported = Object.keys(
        sessionProperties,
      ).every((sessionProperty) => isSupportedSessionProperty(sessionProperty));

      if (!allSessionPropertiesSupported) {
        throw new Error(
          `${Caip25EndowmentPermissionName} error: Received unknown session property(s) for caveat of type "${Caip25CaveatType}".`,
        );
      }

      assertIsInternalScopesObject(requiredScopes);
      assertIsInternalScopesObject(optionalScopes);

      if (
        Object.keys(requiredScopes).length === 0 &&
        Object.keys(optionalScopes).length === 0
      ) {
        throw new Error(
          `${Caip25EndowmentPermissionName} error: Received no scopes for caveat of type "${Caip25CaveatType}".`,
        );
      }

      const isEvmChainIdSupported = (chainId: Hex) => {
        try {
          findNetworkClientIdByChainId(chainId);
          return true;
        } catch {
          return false;
        }
      };

      const unsupportedScopes = Object.keys({
        ...requiredScopes,
        ...optionalScopes,
      }).filter(
        (scopeString) =>
          !isSupportedScopeString(scopeString, {
            isEvmChainIdSupported,
            isNonEvmScopeSupported,
          }),
      );

      if (unsupportedScopes.length > 0) {
        throw new Error(
          `${Caip25EndowmentPermissionName} error: Received scopeString value(s): ${unsupportedScopes.join(', ')} for caveat of type "${Caip25CaveatType}" that are not supported by the wallet.`,
        );
      }

      const allRequiredAccountsSupported =
        isEveryAccountInScopesObjectSupported(
          requiredScopes,
          listAccounts,
          getNonEvmAccountAddresses,
        );
      const allOptionalAccountsSupported =
        isEveryAccountInScopesObjectSupported(
          optionalScopes,
          listAccounts,
          getNonEvmAccountAddresses,
        );
      if (!allRequiredAccountsSupported || !allOptionalAccountsSupported) {
        throw new Error(
          `${Caip25EndowmentPermissionName} error: Received account value(s) for caveat of type "${Caip25CaveatType}" that are not supported by the wallet.`,
        );
      }
    },
    merger: (
      leftValue: Caip25CaveatValue,
      rightValue: Caip25CaveatValue,
    ): [Caip25CaveatValue, Caip25CaveatValue] => {
      const mergedRequiredScopes = mergeInternalScopes(
        leftValue.requiredScopes,
        rightValue.requiredScopes,
      );
      const mergedOptionalScopes = mergeInternalScopes(
        leftValue.optionalScopes,
        rightValue.optionalScopes,
      );

      const mergedSessionProperties = {
        ...leftValue.sessionProperties,
        ...rightValue.sessionProperties,
      };

      const mergedValue: Caip25CaveatValue = {
        requiredScopes: mergedRequiredScopes,
        optionalScopes: mergedOptionalScopes,
        sessionProperties: mergedSessionProperties,
        isMultichainOrigin: leftValue.isMultichainOrigin,
      };

      const partialDiff = diffScopesForCaip25CaveatValue(
        leftValue,
        mergedValue,
        'requiredScopes',
      );

      const diff = diffScopesForCaip25CaveatValue(
        partialDiff,
        mergedValue,
        'optionalScopes',
      );

      return [mergedValue, diff];
    },
  };
};

type Caip25EndowmentSpecification = ValidPermissionSpecification<{
  permissionType: PermissionType.Endowment;
  targetName: typeof Caip25EndowmentPermissionName;
  endowmentGetter: (_options?: EndowmentGetterParams) => null;
  validator: PermissionValidatorConstraint;
  allowedCaveats: Readonly<NonEmptyArray<string>> | null;
}>;

/**
 * Helper that returns a `endowment:caip25` specification that
 * can be passed into the PermissionController constructor.
 *
 * @returns The specification for the `caip25` endowment.
 */
const specificationBuilder: PermissionSpecificationBuilder<
  PermissionType.Endowment,
  Record<never, never>,
  Caip25EndowmentSpecification
> = () => {
  return {
    permissionType: PermissionType.Endowment,
    targetName: Caip25EndowmentPermissionName,
    allowedCaveats: [Caip25CaveatType],
    endowmentGetter: (_getterOptions?: EndowmentGetterParams) => null,
    validator: (permission: PermissionConstraint) => {
      if (
        permission.caveats?.length !== 1 ||
        permission.caveats?.[0]?.type !== Caip25CaveatType
      ) {
        throw new Error(
          `${Caip25EndowmentPermissionName} error: Invalid caveats. There must be a single caveat of type "${Caip25CaveatType}".`,
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
  const updatedCaveatValue = cloneDeep(caip25CaveatValue);

  [
    updatedCaveatValue.requiredScopes,
    updatedCaveatValue.optionalScopes,
  ].forEach((scopes) => {
    Object.entries(scopes).forEach(([, scopeObject]) => {
      removeAccountFromScopeObject(scopeObject, targetAddress);
    });
  });

  const noChange = isEqual(updatedCaveatValue, caip25CaveatValue);

  if (noChange) {
    return {
      operation: CaveatMutatorOperation.Noop,
    };
  }

  const hasAccounts = [
    ...Object.values(updatedCaveatValue.requiredScopes),
    ...Object.values(updatedCaveatValue.optionalScopes),
  ].some(({ accounts }) => accounts.length > 0);

  if (hasAccounts) {
    return {
      operation: CaveatMutatorOperation.UpdateValue,
      value: updatedCaveatValue,
    };
  }

  return {
    operation: CaveatMutatorOperation.RevokePermission,
  };
}

/**
 * Removes the target scope from the value arrays of the given
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

  if (!requiredScopesRemoved && !optionalScopesRemoved) {
    return {
      operation: CaveatMutatorOperation.Noop,
    };
  }

  const updatedCaveatValue = {
    ...caip25CaveatValue,
    requiredScopes: Object.fromEntries(newRequiredScopes),
    optionalScopes: Object.fromEntries(newOptionalScopes),
  };

  const hasNonWalletScopes = [...newRequiredScopes, ...newOptionalScopes].some(
    ([scopeString]) => {
      const { namespace } = parseScopeString(scopeString);
      return namespace !== KnownCaipNamespace.Wallet;
    },
  );

  if (hasNonWalletScopes) {
    return {
      operation: CaveatMutatorOperation.UpdateValue,
      value: updatedCaveatValue,
    };
  }

  return {
    operation: CaveatMutatorOperation.RevokePermission,
  };
}

/**
 * Modifies the requested CAIP-25 permissions object after UI confirmation.
 *
 * @param caip25CaveatValue - The requested CAIP-25 caveat value to modify.
 * @param accountAddresses - The list of permitted eth addresses.
 * @param chainIds - The list of permitted eth chainIds.
 * @returns The updated CAIP-25 caveat value with the permitted accounts and chainIds set.
 */
export const generateCaip25Caveat = (
  caip25CaveatValue: Caip25CaveatValue,
  accountAddresses: CaipAccountId[],
  chainIds: CaipChainId[],
): {
  [Caip25EndowmentPermissionName]: {
    caveats: [{ type: string; value: Caip25CaveatValue }];
  };
} => {
  const caveatValueWithChains = setChainIdsInCaip25CaveatValue(
    caip25CaveatValue,
    chainIds,
  );

  const caveatValueWithAccounts = setNonSCACaipAccountIdsInCaip25CaveatValue(
    caveatValueWithChains,
    accountAddresses,
  );

  return {
    [Caip25EndowmentPermissionName]: {
      caveats: [
        {
          type: Caip25CaveatType,
          value: caveatValueWithAccounts,
        },
      ],
    },
  };
};

/**
 * Helper to get the CAIP-25 caveat from a permission
 *
 * @param [caip25Permission] - The CAIP-25 permission object
 * @param caip25Permission.caveats - The caveats of the CAIP-25 permission
 * @returns The CAIP-25 caveat or undefined if not found
 */
export function getCaip25CaveatFromPermission(caip25Permission?: {
  caveats: (
    | {
        type: string;
        value: unknown;
      }
    | {
        type: typeof Caip25CaveatType;
        value: Caip25CaveatValue;
      }
  )[];
}) {
  return caip25Permission?.caveats.find(
    (caveat) => caveat.type === (Caip25CaveatType as string),
  ) as
    | {
        type: typeof Caip25CaveatType;
        value: Caip25CaveatValue;
      }
    | undefined;
}

/**
 * Requests user approval for the CAIP-25 permission for the specified origin
 * and returns a granted permissions object.
 *
 * @param requestedPermissions - The legacy permissions to request approval for.
 * @param requestedPermissions.caveats - The legacy caveats processed by the function.
 * - `restrictReturnedAccounts`: Restricts which Ethereum accounts can be accessed
 * - `restrictNetworkSwitching`: Restricts which blockchain networks can be used
 * @returns CAIP-25 permission object with unified caveat structure containing both account and chain restrictions
 */
export const getCaip25PermissionFromLegacyPermissions =
  (requestedPermissions?: {
    [PermissionKeys.eth_accounts]?: {
      caveats?: {
        type: keyof typeof CaveatTypes;
        value: Hex[];
      }[];
    };
    [PermissionKeys.permittedChains]?: {
      caveats?: {
        type: keyof typeof CaveatTypes;
        value: Hex[];
      }[];
    };
  }) => {
    const permissions = pick(requestedPermissions, [
      PermissionKeys.eth_accounts,
      PermissionKeys.permittedChains,
    ]);

    if (!permissions[PermissionKeys.eth_accounts]) {
      permissions[PermissionKeys.eth_accounts] = {};
    }

    if (!permissions[PermissionKeys.permittedChains]) {
      permissions[PermissionKeys.permittedChains] = {};
    }

    const requestedAccounts =
      permissions[PermissionKeys.eth_accounts]?.caveats?.find(
        (caveat) => caveat.type === CaveatTypes.restrictReturnedAccounts,
      )?.value ?? [];

    const requestedChains =
      permissions[PermissionKeys.permittedChains]?.caveats?.find(
        (caveat) => caveat.type === CaveatTypes.restrictNetworkSwitching,
      )?.value ?? [];

    const newCaveatValue = {
      requiredScopes: {},
      optionalScopes: {
        'wallet:eip155': {
          accounts: [],
        },
      },
      sessionProperties: {},
      isMultichainOrigin: false,
    };

    const caveatValueWithChains = setPermittedEthChainIds(
      newCaveatValue,
      requestedChains,
    );

    const caveatValueWithAccountsAndChains = setEthAccounts(
      caveatValueWithChains,
      requestedAccounts,
    );

    return {
      [Caip25EndowmentPermissionName]: {
        caveats: [
          {
            type: Caip25CaveatType,
            value: caveatValueWithAccountsAndChains,
          },
        ],
      },
    };
  };

/**
 * Requests incremental permittedChains permission for the specified origin.
 * and updates the existing CAIP-25 permission.
 * Allows for granting without prompting for user approval which
 * would be used as part of flows like `wallet_addEthereumChain`
 * requests where the addition of the network and the permitting
 * of the chain are combined into one approval.
 *
 * @param options - The options object
 * @param options.origin - The origin to request approval for.
 * @param options.chainId - The chainId to add to the existing permittedChains.
 * @param options.autoApprove - If the chain should be granted without prompting for user approval.
 * @param options.metadata - Request data for the approval.
 * @param options.metadata.options - Additional metadata about the permission request.
 * @param options.hooks - Permission controller hooks for incremental operations.
 * @param options.hooks.requestPermissionsIncremental - Initiates an incremental permission request that prompts for user approval.
 * Incremental permission requests allow the caller to replace existing and/or add brand new permissions and caveats for the specified subject.
 * @param options.hooks.grantPermissionsIncremental - Incrementally grants approved permissions to the specified subject without prompting for user approval.
 * Every permission and caveat is stringently validated and an error is thrown if validation fails.
 */
export const requestPermittedChainsPermissionIncremental = async ({
  origin,
  chainId,
  autoApprove,
  hooks,
  metadata,
}: {
  origin: string;
  chainId: Hex;
  autoApprove: boolean;
  hooks: {
    requestPermissionsIncremental: (
      subject: { origin: string },
      requestedPermissions: Record<
        string,
        { caveats: { type: string; value: unknown }[] }
      >,
      options?: { metadata?: Record<string, Json> },
    ) => Promise<
      | [
          Partial<Record<string, unknown>>,
          { data?: Record<string, unknown>; id: string; origin: string },
        ]
      | []
    >;
    grantPermissionsIncremental: (params: {
      subject: { origin: string };
      approvedPermissions: Record<
        string,
        { caveats: { type: string; value: unknown }[] }
      >;
      requestData?: Record<string, unknown>;
    }) => Partial<Record<string, unknown>>;
  };
  metadata?: { options: Record<string, Json> };
}) => {
  const caveatValueWithChains = setPermittedEthChainIds(
    {
      requiredScopes: {},
      optionalScopes: {},
      sessionProperties: {},
      isMultichainOrigin: false,
    },
    [chainId],
  );

  if (!autoApprove) {
    let options;
    if (metadata) {
      options = { metadata };
    }
    await hooks.requestPermissionsIncremental(
      { origin },
      {
        [Caip25EndowmentPermissionName]: {
          caveats: [
            {
              type: Caip25CaveatType,
              value: caveatValueWithChains,
            },
          ],
        },
      },
      options,
    );
    return;
  }

  hooks.grantPermissionsIncremental({
    subject: { origin },
    approvedPermissions: {
      [Caip25EndowmentPermissionName]: {
        caveats: [
          {
            type: Caip25CaveatType,
            value: caveatValueWithChains,
          },
        ],
      },
    },
  });
};
