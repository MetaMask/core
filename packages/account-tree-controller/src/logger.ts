import { createProjectLogger, createModuleLogger } from '@metamask/utils';

export const projectLogger = createProjectLogger('AccountTreeController');
export const backupAndSyncLogger = createModuleLogger(
  projectLogger,
  'Backup and sync',
);
