/* istanbul ignore file */

import { createProjectLogger, createModuleLogger } from '@metamask/utils';

export const projectLogger = createProjectLogger('message-manager');

export const typedMessageManagerLogger = createModuleLogger(
  projectLogger,
  'typed-message-manager',
);

export { createModuleLogger };
