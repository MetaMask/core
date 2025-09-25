import { createProjectLogger, createModuleLogger } from '@metamask/utils';

export const projectLogger = createProjectLogger('multichain-account-service');

export { createModuleLogger };

export const WARNING_PREFIX = 'WARNING --';

export type Logger = typeof projectLogger;
