import {
  Caip25CaveatType,
  Caip25EndowmentPermissionName,
  getEthAccounts,
  bucketScopes,
  validateAndNormalizeScopes,
  type Caip25Authorization,
  getInternalScopesObject,
  getSessionScopes,
  type NormalizedScopesObject,
  getSupportedScopeObjects,
  type Caip25CaveatValue,
  isKnownSessionPropertyValue,
  getCaipAccountIdsFromScopesObjects,
  getAllScopesFromScopesObjects,
  setPermittedAccounts,
} from '@metamask/chain-agnostic-permission';
import { isEqualCaseInsensitive } from '@metamask/controller-utils';
import type {
  JsonRpcEngineEndCallback,
  JsonRpcEngineNextCallback,
} from '@metamask/json-rpc-engine';
import type { NetworkController } from '@metamask/network-controller';
import {
  invalidParams,
  type RequestedPermissions,
} from '@metamask/permission-controller';
import { JsonRpcError, rpcErrors } from '@metamask/rpc-errors';
import {
  type CaipAccountId,
  type CaipChainId,
  type Hex,
  isPlainObject,
  type Json,
  type JsonRpcRequest,
  type JsonRpcSuccess,
  KnownCaipNamespace,
  parseCaipAccountId,
} from '@metamask/utils';

import type {
  GrantedPermissions,
  MetaMetricsEventOptions,
  MetaMetricsEventPayload,
} from './types';
import { shouldEmitDappViewedEvent } from './utils';

/**
 * Handler for the `wallet_createSession` RPC method which is responsible
 * for prompting for approval and granting a CAIP-25 permission.
 *
 * This implementation primarily deviates from the CAIP-25 handler
 * specification by treating all scopes as optional regardless of
 * if they were specified in `requiredScopes` or `optionalScopes`.
 * Additionally, provided scopes, methods, notifications, and
 * account values that are invalid/malformed are ignored rather than
 * causing an error to be returned.
 *
 * @param req - The request object.
 * @param res - The response object.
 * @param _next - The next middleware function.
 * @param end - The end function.
 * @param hooks - The hooks object.
 * @param hooks.listAccounts - The hook that returns an array of the wallet's evm accounts.
 * @param hooks.findNetworkClientIdByChainId - The hook that returns the networkClientId for a chainId.
 * @param hooks.requestPermissionsForOrigin - The hook that approves and grants requested permissions.
 * @param hooks.sendMetrics - The hook that tracks an analytics event.
 * @param hooks.getNonEvmSupportedMethods - The hook that returns the supported methods for a non EVM scope.
 * @param hooks.isNonEvmScopeSupported - The hook that returns true if a non EVM scope is supported.
 * @param hooks.getNonEvmAccountAddresses - The hook that returns a list of CaipAccountIds that are supported for a CaipChainId.
 * @param hooks.metamaskState - The wallet state.
 * @param hooks.metamaskState.metaMetricsId - The analytics id.
 * @param hooks.metamaskState.permissionHistory - The permission history object keyed by origin.
 * @param hooks.metamaskState.accounts - The accounts object keyed by address.
 * @returns A promise with wallet_createSession handler
 */
async function walletCreateSessionHandler(
  req: JsonRpcRequest<Caip25Authorization> & { origin: string },
  res: JsonRpcSuccess<{
    sessionScopes: NormalizedScopesObject;
    sessionProperties?: Record<string, Json>;
  }>,
  _next: JsonRpcEngineNextCallback,
  end: JsonRpcEngineEndCallback,
  hooks: {
    listAccounts: () => { address: string }[];
    findNetworkClientIdByChainId: NetworkController['findNetworkClientIdByChainId'];
    requestPermissionsForOrigin: (
      requestedPermissions: RequestedPermissions,
      metadata?: Record<string, Json>,
    ) => Promise<[GrantedPermissions]>;
    sendMetrics: (
      payload: MetaMetricsEventPayload,
      options?: MetaMetricsEventOptions,
    ) => void;
    getNonEvmSupportedMethods: (scope: CaipChainId) => string[];
    isNonEvmScopeSupported: (scope: CaipChainId) => boolean;
    metamaskState: {
      metaMetricsId: string;
      permissionHistory: Record<string, unknown>;
      accounts: Record<string, unknown>;
    };
    getNonEvmAccountAddresses: (scope: CaipChainId) => CaipAccountId[];
  },
) {
  const { origin } = req;
  if (!isPlainObject(req.params)) {
    return end(invalidParams({ data: { request: req } }));
  }
  const { requiredScopes, optionalScopes, sessionProperties } = req.params;

  if (sessionProperties && Object.keys(sessionProperties).length === 0) {
    return end(new JsonRpcError(5302, 'Invalid sessionProperties requested'));
  }

  const filteredSessionProperties = Object.fromEntries(
    Object.entries(sessionProperties ?? {}).filter(([key]) =>
      isKnownSessionPropertyValue(key),
    ),
  );

  try {
    const { normalizedRequiredScopes, normalizedOptionalScopes } =
      validateAndNormalizeScopes(requiredScopes || {}, optionalScopes || {});

    const requiredScopesWithSupportedMethodsAndNotifications =
      getSupportedScopeObjects(normalizedRequiredScopes, {
        getNonEvmSupportedMethods: hooks.getNonEvmSupportedMethods,
      });
    const optionalScopesWithSupportedMethodsAndNotifications =
      getSupportedScopeObjects(normalizedOptionalScopes, {
        getNonEvmSupportedMethods: hooks.getNonEvmSupportedMethods,
      });

    const networkClientExistsForChainId = (chainId: Hex) => {
      try {
        hooks.findNetworkClientIdByChainId(chainId);
        return true;
      } catch (err) {
        return false;
      }
    };

    const { supportedScopes: supportedRequiredScopes } = bucketScopes(
      requiredScopesWithSupportedMethodsAndNotifications,
      {
        isEvmChainIdSupported: networkClientExistsForChainId,
        isEvmChainIdSupportable: () => false, // intended for future usage with eip3085 scopedProperties
        getNonEvmSupportedMethods: hooks.getNonEvmSupportedMethods,
        isNonEvmScopeSupported: hooks.isNonEvmScopeSupported,
      },
    );

    const { supportedScopes: supportedOptionalScopes } = bucketScopes(
      optionalScopesWithSupportedMethodsAndNotifications,
      {
        isEvmChainIdSupported: networkClientExistsForChainId,
        isEvmChainIdSupportable: () => false, // intended for future usage with eip3085 scopedProperties
        getNonEvmSupportedMethods: hooks.getNonEvmSupportedMethods,
        isNonEvmScopeSupported: hooks.isNonEvmScopeSupported,
      },
    );

    const allRequestedAccountAddresses = getCaipAccountIdsFromScopesObjects([
      supportedRequiredScopes,
      supportedOptionalScopes,
    ]);

    const allSupportedRequestedCaipChainIds = getAllScopesFromScopesObjects([
      supportedRequiredScopes,
      supportedOptionalScopes,
    ]);

    if (allSupportedRequestedCaipChainIds.length === 0) {
      return end(new JsonRpcError(5100, 'Requested scopes are not supported'));
    }

    const existingEvmAddresses = hooks
      .listAccounts()
      .map((account) => account.address);

    const supportedRequestedAccountAddresses =
      allRequestedAccountAddresses.filter(
        (requestedAccountAddress: CaipAccountId) => {
          const {
            address,
            chain: { namespace },
            chainId: caipChainId,
          } = parseCaipAccountId(requestedAccountAddress);
          if (namespace === KnownCaipNamespace.Eip155) {
            return existingEvmAddresses.some((existingEvmAddress) => {
              return isEqualCaseInsensitive(address, existingEvmAddress);
            });
          }

          // If the namespace is not eip155 (EVM) we do a case sensitive check
          return hooks
            .getNonEvmAccountAddresses(caipChainId)
            .some((existingCaipAddress) => {
              return requestedAccountAddress === existingCaipAddress;
            });
        },
      );

    const requestedCaip25CaveatValue = {
      requiredScopes: getInternalScopesObject(supportedRequiredScopes),
      optionalScopes: getInternalScopesObject(supportedOptionalScopes),
      isMultichainOrigin: true,
      sessionProperties: filteredSessionProperties,
    };

    const requestedCaip25CaveatValueWithSupportedAccounts =
      setPermittedAccounts(
        requestedCaip25CaveatValue,
        supportedRequestedAccountAddresses,
      );

    const [grantedPermissions] = await hooks.requestPermissionsForOrigin({
      [Caip25EndowmentPermissionName]: {
        caveats: [
          {
            type: Caip25CaveatType,
            value: requestedCaip25CaveatValueWithSupportedAccounts,
          },
        ],
      },
    });

    const approvedCaip25Permission =
      grantedPermissions[Caip25EndowmentPermissionName];
    const approvedCaip25CaveatValue = approvedCaip25Permission?.caveats?.find(
      (caveat) => caveat.type === Caip25CaveatType,
    )?.value as Caip25CaveatValue;
    if (!approvedCaip25CaveatValue) {
      throw rpcErrors.internal();
    }

    const sessionScopes = getSessionScopes(approvedCaip25CaveatValue, {
      getNonEvmSupportedMethods: hooks.getNonEvmSupportedMethods,
    });

    const { sessionProperties: approvedSessionProperties = {} } =
      approvedCaip25CaveatValue;

    // TODO: Contact analytics team for how they would prefer to track this
    // first time connection to dapp will lead to no log in the permissionHistory
    // and if user has connected to dapp before, the dapp origin will be included in the permissionHistory state
    // we will leverage that to identify `is_first_visit` for metrics
    if (shouldEmitDappViewedEvent(hooks.metamaskState.metaMetricsId)) {
      const isFirstVisit = !Object.keys(
        hooks.metamaskState.permissionHistory,
      ).includes(origin);

      const approvedEthAccounts = getEthAccounts(approvedCaip25CaveatValue);

      hooks.sendMetrics({
        event: 'Dapp Viewed', // TODO: metametrics constants... where should these live ?
        category: 'inpage_provider', // TODO: metametrics constants... where should these live ?
        referrer: {
          url: origin,
        },
        properties: {
          is_first_visit: isFirstVisit,
          number_of_accounts: Object.keys(hooks.metamaskState.accounts).length,
          number_of_accounts_connected: approvedEthAccounts.length,
        },
      });
    }

    res.result = {
      sessionScopes,
      sessionProperties: approvedSessionProperties,
    };
    return end();
  } catch (err) {
    return end(err);
  }
}

export const walletCreateSession = {
  methodNames: ['wallet_createSession'],
  implementation: walletCreateSessionHandler,
  hookNames: {
    findNetworkClientIdByChainId: true,
    listAccounts: true,
    requestPermissionsForOrigin: true,
    sendMetrics: true,
    metamaskState: true,
    getNonEvmSupportedMethods: true,
    isNonEvmScopeSupported: true,
    getNonEvmAccountAddresses: true,
  },
};
