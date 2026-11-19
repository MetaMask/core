import { createProjectLogger, createModuleLogger } from '@metamask/utils';

export const projectLogger = createProjectLogger(
  'money-account-api-data-service',
);

export { createModuleLogger };
