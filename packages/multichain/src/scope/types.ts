import {
  isCaipNamespace,
  isCaipChainId,
  parseCaipChainId,
} from '@metamask/utils';
import type {
  CaipChainId,
  CaipReference,
  CaipAccountId,
  KnownCaipNamespace,
  CaipNamespace,
  Json,
  JsonRpcParams,
} from '@metamask/utils';

/**
 * Represents a `scopeString` as defined in [CAIP-217](https://chainagnostic.org/CAIPs/caip-217).
 */
export type ExternalScopeString = CaipChainId | CaipNamespace;
/**
 * Represents a `scopeObject` as defined in [CAIP-217](https://chainagnostic.org/CAIPs/caip-217).
 */
export type ExternalScopeObject = Omit<NormalizedScopeObject, 'accounts'> & {
  references?: CaipReference[];
  accounts?: CaipAccountId[];
};
/**
 * Represents a `scope` as defined in [CAIP-217](https://chainagnostic.org/CAIPs/caip-217).
 * TODO update the language in CAIP-217 to use "scope" instead of "scopeObject" for this full record type.
 */
export type ExternalScopesObject = Record<
  ExternalScopeString,
  ExternalScopeObject
>;

/**
 * Represents a `scopeString` as defined in
 * [CAIP-217](https://chainagnostic.org/CAIPs/caip-217), with the exception that
 * CAIP namespaces without a reference (aside from "wallet") are disallowed for our internal representations of CAIP-25 session scopes
 */
export type InternalScopeString = CaipChainId | KnownCaipNamespace.Wallet;

/**
 * A trimmed down version of a [CAIP-217](https://chainagnostic.org/CAIPs/caip-217) defined scopeObject that is stored in a `endowment:caip25` permission.
 * The only property from the original CAIP-25 scopeObject that we use for permissioning is `accounts`.
 */
export type InternalScopeObject = {
  accounts: CaipAccountId[];
};

/**
 * A trimmed down version of a [CAIP-217](https://chainagnostic.org/CAIPs/caip-217) scope that is stored in a `endowment:caip25` permission.
 * Accounts arrays are mapped to CAIP-2 chainIds. These are currently the only properties used by the permission system.
 */
export type InternalScopesObject = Record<CaipChainId, InternalScopeObject> & {
  [KnownCaipNamespace.Wallet]?: InternalScopeObject;
};

/**
 * Represents a `scopeObject` as defined in
 * [CAIP-217](https://chainagnostic.org/CAIPs/caip-217), with the exception that
 * we resolve the `references` property into a scopeObject per reference and
 * assign an empty array to the `accounts` property if not already defined
 * to more easily perform support checks for `wallet_createSession` requests.
 * Also used as the return type for `wallet_createSession` and `wallet_sessionChanged`.
 */
export type NormalizedScopeObject = {
  methods: string[];
  notifications: string[];
  accounts: CaipAccountId[];
  rpcDocuments?: string[];
  rpcEndpoints?: string[];
};
/**
 * Represents a keyed `scopeObject` as defined in
 * [CAIP-217](https://chainagnostic.org/CAIPs/caip-217), with the exception that
 * we resolve the `references` property into a scopeObject per reference and
 * assign an empty array to the `accounts` property if not already defined
 * to more easily perform support checks for `wallet_createSession` requests.
 * Also used as the return type for `wallet_createSession` and `wallet_sessionChanged`.
 */
export type NormalizedScopesObject = Record<
  CaipChainId,
  NormalizedScopeObject
> & {
  [KnownCaipNamespace.Wallet]?: NormalizedScopeObject;
};

export type ScopedProperties = Record<CaipChainId, Record<string, Json>> & {
  [KnownCaipNamespace.Wallet]?: Record<string, Json>;
};

/**
 * Parses a scope string into a namespace and reference.
 * @param scopeString - The scope string to parse.
 * @returns An object containing the namespace and reference.
 */
export const parseScopeString = (
  scopeString: string,
): {
  namespace?: string;
  reference?: string;
} => {
  if (isCaipNamespace(scopeString)) {
    return {
      namespace: scopeString,
    };
  }
  if (isCaipChainId(scopeString)) {
    return parseCaipChainId(scopeString);
  }

  return {};
};

/**
 * CAIP namespaces excluding "wallet" currently supported by/known to the wallet.
 */
export type NonWalletKnownCaipNamespace = Exclude<
  KnownCaipNamespace,
  KnownCaipNamespace.Wallet
>;

// {
//   "id": 1,
//   "jsonrpc": "2.0",
//   "method": "wallet_invokeMethod",
//   "params": {
//     "sessionId": "0xdeadbeef",
//     "scope": "eip155:1",
//     "request": {
//       "method": "eth_sendTransaction",
//       "params": [
//         {
//           "to": "0x4B0897b0513FdBeEc7C469D9aF4fA6C0752aBea7",
//           "from": "0xDeaDbeefdEAdbeefdEadbEEFdeadbeefDEADbEEF",
//           "gas": "0x76c0",
//           "value": "0x8ac7230489e80000",
//           "data": "0x",
//           "gasPrice": "0x4a817c800"
//         }
//       ]
//     }
//   }
// }

/**
 * Parameters for the `wallet_invokeMethod` method as defined in CAIP-27.
 */
export type Caip27Params = {
  scope: string;
  request: {
    method: string;
    params: JsonRpcParams;
  };
};

/**
 * Parameters for the `wallet_notify` method as defined in CAIP-319.
 */
export type Caip319Params = {
  scope: string;
  notification: {
    method: string;
    params: JsonRpcParams;
  };
};

/**
 * Parameters for the `wallet_revokeSession` method as defined in CAIP-285.
 */
export type Caip285Params = {
  scope: string;
  request: {
    method: string;
    params: Record<PropertyKey, never>;
  };
};
