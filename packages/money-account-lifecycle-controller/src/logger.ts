/* istanbul ignore file */

import { createProjectLogger, createModuleLogger } from '@metamask/utils';

export const projectLogger = createProjectLogger(
  'money-account-lifecycle-controller',
);

export { createModuleLogger };
