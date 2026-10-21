import type { JsonRpcError } from '@metamask/rpc-errors';
import { providerErrors, rpcErrors } from '@metamask/rpc-errors';

import { METHOD_NAMES } from './constants.js';

const PREFIX = `${METHOD_NAMES.WALLET_PAY}:`;

/** Every error `wallet_pay` returns, besides ones from adding the transaction. */
export const walletPayErrors = {
  invalidParams: (details: string): JsonRpcError<never> =>
    rpcErrors.invalidParams({
      message: `${PREFIX} invalid params.\n\n${details}`,
    }),

  unsupportedType: (type: string): JsonRpcError<never> =>
    rpcErrors.methodNotFound({
      message: `${PREFIX} type "${type}" is not available.`,
    }),

  unauthorizedAccount: (): JsonRpcError<never> =>
    providerErrors.unauthorized({
      message: `${PREFIX} "from" is not an account connected to this site.`,
    }),

  networkUnavailable: (chainId: string): JsonRpcError<never> =>
    rpcErrors.internal({
      message: `${PREFIX} network ${chainId} is not configured.`,
    }),

  // Provisional code; to be confirmed with the Perps team before release.
  perpsNotEligible: (): JsonRpcError<{ reason: string }> =>
    rpcErrors.methodNotSupported({
      message: `${PREFIX} perps is not available in your region.`,
      data: { reason: 'perpsNotEligible' },
    }),
};
