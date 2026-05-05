import type { UnionToIntersection } from '@metamask/json-rpc-engine/v2';

import type { WalletCreateSessionHooks } from './wallet-createSession';
import { walletCreateSessionHandler } from './wallet-createSession';
import type { WalletGetSessionHooks } from './wallet-getSession';
import { walletGetSessionHandler } from './wallet-getSession';
import type { WalletInvokeMethodHooks } from './wallet-invokeMethod';
import { walletInvokeMethodHandler } from './wallet-invokeMethod';
import type { WalletRevokeSessionHooks } from './wallet-revokeSession';
import { walletRevokeSessionHandler } from './wallet-revokeSession';

export type MethodHandlerHooks = UnionToIntersection<
  | WalletCreateSessionHooks
  | WalletGetSessionHooks
  | WalletInvokeMethodHooks
  | WalletRevokeSessionHooks
>;

const MethodNames = {
  WalletCreateSession: 'wallet_createSession',
  WalletGetSession: 'wallet_getSession',
  WalletInvokeMethod: 'wallet_invokeMethod',
  WalletRevokeSession: 'wallet_revokeSession',
} as const;

type MethodHandlers = {
  [MethodNames.WalletCreateSession]: typeof walletCreateSessionHandler;
  [MethodNames.WalletGetSession]: typeof walletGetSessionHandler;
  [MethodNames.WalletInvokeMethod]: typeof walletInvokeMethodHandler;
  [MethodNames.WalletRevokeSession]: typeof walletRevokeSessionHandler;
};

export const methodHandlers: Readonly<MethodHandlers> = {
  [MethodNames.WalletCreateSession]: walletCreateSessionHandler,
  [MethodNames.WalletGetSession]: walletGetSessionHandler,
  [MethodNames.WalletInvokeMethod]: walletInvokeMethodHandler,
  [MethodNames.WalletRevokeSession]: walletRevokeSessionHandler,
};
