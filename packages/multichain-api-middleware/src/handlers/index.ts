import type { UnionToIntersection } from '@metamask/json-rpc-engine/v2';

import type { WalletCreateSessionHooks } from './wallet-createSession.js';
import { walletCreateSessionHandler } from './wallet-createSession.js';
import type { WalletGetSessionHooks } from './wallet-getSession.js';
import { walletGetSessionHandler } from './wallet-getSession.js';
import type { WalletInvokeMethodHooks } from './wallet-invokeMethod.js';
import { walletInvokeMethodHandler } from './wallet-invokeMethod.js';
import type { WalletRevokeSessionHooks } from './wallet-revokeSession.js';
import { walletRevokeSessionHandler } from './wallet-revokeSession.js';

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
