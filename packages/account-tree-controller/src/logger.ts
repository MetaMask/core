import { createProjectLogger, createModuleLogger } from '@metamask/utils';

export const projectLogger = createProjectLogger('account-tree-controller');
export const backupAndSyncLogger = createModuleLogger(
  projectLogger,
  'Backup and sync',
);
