/* istanbul ignore file */

import { createProjectLogger, createModuleLogger } from '@metamask/utils';

export const projectLogger = createProjectLogger(
  'analytics-data-regulation-controller',
);

export { createModuleLogger };
