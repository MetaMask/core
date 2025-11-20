/* istanbul ignore file */

import { createProjectLogger, createModuleLogger } from '@metamask/utils';

export const projectLogger = createProjectLogger(
  'gator-permissions-controller',
);

export const controllerLog = createModuleLogger(
  projectLogger,
  'GatorPermissionsController',
);

export const utilsLog = createModuleLogger(projectLogger, 'utils');

export { createModuleLogger };
