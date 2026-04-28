import { walletCreateSessionHandler } from './wallet-createSession';
import { walletGetSessionHandler } from './wallet-getSession';
import { walletInvokeMethodHandler } from './wallet-invokeMethod';
import { walletRevokeSessionHandler } from './wallet-revokeSession';

type MethodHandlers = typeof walletCreateSessionHandler &
  typeof walletGetSessionHandler &
  typeof walletInvokeMethodHandler &
  typeof walletRevokeSessionHandler;

export const methodHandlers: Readonly<MethodHandlers> = {
  ...walletCreateSessionHandler,
  ...walletGetSessionHandler,
  ...walletInvokeMethodHandler,
  ...walletRevokeSessionHandler,
} as const;
