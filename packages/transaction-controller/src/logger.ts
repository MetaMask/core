/* istanbul ignore file */

import { createProjectLogger, createModuleLogger } from '@metamask/utils';

export const projectLogger = createProjectLogger('transaction-controller');

export const incomingTransactionsLogger = createModuleLogger(
  projectLogger,
  'incoming-transactions',
);

export const lifecycleLogger = createModuleLogger(projectLogger, 'lifecycle');

export { createModuleLogger };
