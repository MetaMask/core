import { ContextualLogger } from './contextual-logger';

export const createMockContextualLogger = (
  options: ConstructorParameters<typeof ContextualLogger>[0],
) => {
  const mockContextualLogger = new ContextualLogger(options);
  mockContextualLogger.debug = jest.fn();
  mockContextualLogger.log = jest.fn();
  mockContextualLogger.warn = jest.fn();
  mockContextualLogger.info = jest.fn();
  mockContextualLogger.error = jest.fn();
  return mockContextualLogger;
};
