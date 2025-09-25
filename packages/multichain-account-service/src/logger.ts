/* eslint-disable jsdoc/require-jsdoc */

import { createProjectLogger, createModuleLogger } from '@metamask/utils';

export const projectLogger = createProjectLogger('multichain-account-service');

export { createModuleLogger };

export function warn(message: string) {
  return `WARNING -- ${message}`;
}

export type Logger = typeof projectLogger;
