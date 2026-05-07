/* istanbul ignore file */

import { createProjectLogger, createModuleLogger } from '@metamask/utils';

export const projectLogger = createProjectLogger('snap-account-service');

export { createModuleLogger };

export const WARNING_PREFIX = 'WARNING --';
