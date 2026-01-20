import { createProjectLogger, createModuleLogger } from '@metamask/utils';

import { CONTROLLER_NAME } from './constants';

export const projectLogger = createProjectLogger(CONTROLLER_NAME);

export { createModuleLogger };
