import { walletCreateSessionHandler } from './wallet-createSession';
import { walletGetSessionHandler } from './wallet-getSession';
import { walletInvokeMethodHandler } from './wallet-invokeMethod';
import { walletRevokeSessionHandler } from './wallet-revokeSession';

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
