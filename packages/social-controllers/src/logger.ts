import { createModuleLogger, createProjectLogger } from '@metamask/utils';

export const projectLogger = createProjectLogger('social-controllers');

export const log = createModuleLogger(projectLogger, 'social-controller');
