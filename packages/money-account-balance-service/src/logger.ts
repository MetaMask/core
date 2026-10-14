import { createProjectLogger, createModuleLogger } from '@metamask/utils';

export const projectLogger = createProjectLogger(
  'money-account-balance-service',
);

export { createModuleLogger };
