import { createProjectLogger, createModuleLogger } from '@metamask/utils';

export const projectLogger = createProjectLogger('keyring-controller');
export const lockLogger = createModuleLogger(projectLogger, 'locks');
