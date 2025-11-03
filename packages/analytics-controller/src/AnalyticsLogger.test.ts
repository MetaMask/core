import { projectLogger, createModuleLogger } from './AnalyticsLogger';

describe('AnalyticsLogger', () => {
  describe('projectLogger', () => {
    it('is callable', () => {
      expect(() => {
        projectLogger('test message', { key: 'value' });
      }).not.toThrow();
    });

    it('is a function', () => {
      expect(typeof projectLogger).toBe('function');
    });
  });

  describe('createModuleLogger', () => {
    it('is callable', () => {
      expect(() => {
        const moduleLogger = createModuleLogger(projectLogger, 'test-module');
        moduleLogger('test message', { key: 'value' });
      }).not.toThrow();
    });

    it('returns a function', () => {
      const moduleLogger = createModuleLogger(projectLogger, 'test-module');
      expect(typeof moduleLogger).toBe('function');
    });
  });
});
