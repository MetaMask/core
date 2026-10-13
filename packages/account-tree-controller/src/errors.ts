import type { AccountId } from '@metamask/accounts-controller';

import { toErrorMessage } from './backup-and-sync/utils/errors.js';
import { projectLogger as log } from './logger.js';

export { toErrorMessage } from './backup-and-sync/utils/errors.js';

export type RemoveAccountWalletFailure = {
  id?: AccountId;
  error: unknown;
};

export type RemoveAccountWalletFailureContext = {
  failures: { id?: string; error: string }[];
};

export function reportRemoveAccountWalletError(
  messenger: { captureException?: (error: Error) => void },
  message: string,
  error: Error,
  failures: RemoveAccountWalletFailure[],
): void {
  const context: RemoveAccountWalletFailureContext = {
    failures: failures.map((failure) => ({
      ...(failure.id !== undefined && { id: failure.id }),
      error: toErrorMessage(failure.error),
    })),
  };

  log('ERROR --', message, context);
  console.error(message, { error, context });
  const sentryError = Object.assign(new Error(message, { cause: error }), {
    context,
  });
  messenger.captureException?.(sentryError);
}
