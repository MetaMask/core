/* istanbul ignore file */

import { createProjectLogger, createModuleLogger } from '@metamask/utils';

export const projectLogger = createProjectLogger('kyc-controller');

export const controllerLog = createModuleLogger(projectLogger, 'KycController');

export { createModuleLogger };
