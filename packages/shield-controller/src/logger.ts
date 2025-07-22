import { createProjectLogger, createModuleLogger } from '@metamask/utils';

import { controllerName } from './constants';

export const projectLogger = createProjectLogger(controllerName);

export const incomingTransactionsLogger = createModuleLogger(
  projectLogger,
  'incoming-transactions',
);

export { createModuleLogger };
