import { controllerName } from './constants';

// Mock the @metamask/utils module
jest.mock('@metamask/utils', () => ({
  createProjectLogger: jest.fn().mockReturnValue({}),
  createModuleLogger: jest.fn(),
}));

describe('logger', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();
  });

  it('should create project logger with correct controller name', () => {
    const { createProjectLogger } = require('@metamask/utils');
    
    // Import the logger module to trigger execution
    require('./logger');

    expect(createProjectLogger).toHaveBeenCalledWith(controllerName);
  });

  it('should export createModuleLogger', () => {
    const { createModuleLogger: originalCreateModuleLogger } = require('@metamask/utils');
    const { createModuleLogger: exportedCreateModuleLogger } = require('./logger');

    expect(exportedCreateModuleLogger).toBe(originalCreateModuleLogger);
  });

  it('should export projectLogger', () => {
    const mockLogger = { debug: jest.fn() };
    const { createProjectLogger } = require('@metamask/utils');
    createProjectLogger.mockReturnValue(mockLogger);

    const { projectLogger } = require('./logger');

    expect(projectLogger).toBe(mockLogger);
  });

  it('should use correct controller name from constants', () => {
    expect(controllerName).toBe('SubscriptionController');
  });
});