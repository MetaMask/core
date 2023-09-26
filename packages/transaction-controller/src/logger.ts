import { createProjectLogger, createModuleLogger } from '@metamask/utils';

export const projectLogger = createProjectLogger('transaction-controller');

export const incomingTransactionsLogger = createModuleLogger(
  projectLogger,
  'incoming-transactions',
);

export { createModuleLogger };
