import { createProjectLogger, createModuleLogger } from '@metamask/utils';

import { toErrorMessage } from './utils';

export const projectLogger = createProjectLogger('multichain-account-service');

export { createModuleLogger };

export const WARNING_PREFIX = 'WARNING --';
export const ERROR_PREFIX = 'ERROR --';

export type Logger = typeof projectLogger;

/**
 * Logs an error with either WARNING or ERROR prefix, appending the error message.
 *
 * @param level - 'warn' for WARNING prefix, 'error' for ERROR prefix.
 * @param message - The static message describing what failed.
 * @param error - The caught error.
 */
export function logErrorAs(
  level: 'warn' | 'error',
  message: string,
  error: unknown,
): void {
  const prefix = level === 'warn' ? WARNING_PREFIX : ERROR_PREFIX;
  projectLogger(`${prefix} ${message}: ${toErrorMessage(error)}`);
}
