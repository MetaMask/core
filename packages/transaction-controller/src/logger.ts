import { createProjectLogger, createModuleLogger } from '@metamask/utils';

export const projectLogger = createProjectLogger('transaction-controller');

export const incomingTransactionsLogger = createModuleLogger(
  projectLogger,
  'incoming-transactions',
);

export const pendingTransactionsLogger = createModuleLogger(
  projectLogger,
  'pending-transactions',
);

export { createModuleLogger };
