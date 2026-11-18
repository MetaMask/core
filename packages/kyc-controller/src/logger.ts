import { createModuleLogger, createProjectLogger } from '@metamask/utils';

const projectLogger = createProjectLogger('KycController');

export const traceLogger = createModuleLogger(projectLogger, 'trace');
