import { createProjectLogger, createModuleLogger } from '@metamask/utils';

import { controllerName } from './AccountTreeController';

export const projectLogger = createProjectLogger(controllerName);
export const backupAndSyncLogger = createModuleLogger(
  projectLogger,
  'Backup and sync',
);
