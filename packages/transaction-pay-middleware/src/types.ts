import type { Messenger } from '@metamask/messenger';
import type { NetworkControllerFindNetworkClientIdByChainIdAction } from '@metamask/network-controller';
import type {
  PerpsControllerGetStateAction,
  PerpsControllerRefreshEligibilityAction,
} from '@metamask/perps-controller';
import type { RemoteFeatureFlagControllerGetStateAction } from '@metamask/remote-feature-flag-controller';
import type { Infer } from '@metamask/superstruct';
import {
  nonempty,
  object,
  optional,
  pattern,
  string,
  tuple,
} from '@metamask/superstruct';
import type {
  TransactionControllerAddTransactionAction,
  TransactionParams,
  TransactionType,
} from '@metamask/transaction-controller';
import type { Hex, Json, JsonRpcRequest } from '@metamask/utils';
import { HexChecksumAddressStruct } from '@metamask/utils';

import type { RemoteFeatureFlags } from './utils/feature-flags.js';

type AllowedActions =
  | NetworkControllerFindNetworkClientIdByChainIdAction
  | PerpsControllerGetStateAction
  | PerpsControllerRefreshEligibilityAction
  | RemoteFeatureFlagControllerGetStateAction
  | TransactionControllerAddTransactionAction;

export type TransactionPayMiddlewareMessenger = Messenger<
  'TransactionPayMiddleware',
  AllowedActions
>;

/** A positive decimal string with up to 6 decimals. */
const AmountStruct = pattern(string(), /^(?!0+(\.0+)?$)\d+(\.\d{1,6})?$/u);

export const WalletPayParamsStruct = tuple([
  object({
    type: nonempty(string()),
    from: HexChecksumAddressStruct,
    amount: optional(AmountStruct),
  }),
]);

export type WalletPayRequest = Infer<typeof WalletPayParamsStruct>[0];

/** Result of `wallet_pay`, returned once the transfer completes. */
export type WalletPayResult = {
  transactionHash?: Hex;
};

/** A transaction built for a `wallet_pay` request, ready to add. */
export type WalletPayTransaction = {
  chainId: Hex;
  transactionParams: TransactionParams;
  type: TransactionType;
  skipInitialGasEstimate?: boolean;
};

/** How one `wallet_pay` type is enabled, checked and built. */
export type WalletPayFlow = {
  /** Flag checks beyond `confirmations_pay_rpc`, if the type needs any. */
  isEnabled?: (remoteFeatureFlags: RemoteFeatureFlags) => boolean;
  assertPreconditions?: (
    messenger: TransactionPayMiddlewareMessenger,
  ) => Promise<void>;
  build: (request: WalletPayRequest) => WalletPayTransaction;
};

export type WalletPayJsonRpcRequest = JsonRpcRequest<Json[]> & {
  origin: string;
};

export type WalletPayHooks = {
  /** Returns the accounts the requesting origin is connected to. */
  getPermittedAccountsForOrigin: () => Promise<string[]>;
};
