import { createProjectLogger, createModuleLogger } from '@metamask/utils';

import { controllerName } from './constants';

export const projectLogger = createProjectLogger(controllerName);

export { createModuleLogger };
