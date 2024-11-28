/* istanbul ignore file */

import { createProjectLogger, createModuleLogger } from '@metamask/utils';

export const projectLogger = createProjectLogger('remote-feature-flag-controller');

export const incomingTransactionsLogger = createModuleLogger(
  projectLogger,
  'remote-feature-flag',
);

export { createModuleLogger };
