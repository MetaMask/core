import { ContextualLogger } from './contextual-logger';

describe('BackupAndSyncUtils - ContextualLogger', () => {
  const LOG_PREFIX = '[AccountTreeController - Backup and sync] ';
  const contextualLogger = new ContextualLogger({
    isEnabled: true,
  });

  // Mock console methods before each test
  let consoleSpy: {
    log: jest.SpyInstance;
    warn: jest.SpyInstance;
    info: jest.SpyInstance;
    error: jest.SpyInstance;
    debug: jest.SpyInstance;
  };

  beforeEach(() => {
    consoleSpy = {
      log: jest.spyOn(console, 'log').mockImplementation(),
      warn: jest.spyOn(console, 'warn').mockImplementation(),
      info: jest.spyOn(console, 'info').mockImplementation(),
      error: jest.spyOn(console, 'error').mockImplementation(),
      debug: jest.spyOn(console, 'debug').mockImplementation(),
    };
  });

  afterEach(() => {
    Object.values(consoleSpy).forEach((spy) => spy.mockRestore());
  });

  describe('log', () => {
    it('does not log when logging is disabled', () => {
      const disabledLogger = new ContextualLogger();
      disabledLogger.log('Test message');

      expect(consoleSpy.log).not.toHaveBeenCalled();
    });

    it('calls console.log with LOG_PREFIX and arguments', () => {
      const message = 'Test log message';
      const additionalArg = { key: 'value' };

      contextualLogger.log(message, additionalArg);

      expect(consoleSpy.log).toHaveBeenCalledWith(
        LOG_PREFIX,
        message,
        additionalArg,
      );
      expect(consoleSpy.log).toHaveBeenCalledTimes(1);
    });

    it('handles multiple arguments', () => {
      const args = ['arg1', 42, { test: true }, null, undefined];

      contextualLogger.log(...args);

      expect(consoleSpy.log).toHaveBeenCalledWith(LOG_PREFIX, ...args);
    });

    it('handles no arguments', () => {
      contextualLogger.log();

      expect(consoleSpy.log).toHaveBeenCalledWith(LOG_PREFIX);
    });

    it('handles complex objects', () => {
      const complexObject = {
        nested: { deep: { value: 'test' } },
        array: [1, 2, 3],
        date: new Date(),
        func: () => 'test',
      };

      contextualLogger.log('Complex object:', complexObject);

      expect(consoleSpy.log).toHaveBeenCalledWith(
        LOG_PREFIX,
        'Complex object:',
        complexObject,
      );
    });
  });

  describe('warn', () => {
    it('calls console.warn with LOG_PREFIX and arguments', () => {
      const warning = 'Test warning message';

      contextualLogger.warn(warning);

      expect(consoleSpy.warn).toHaveBeenCalledWith(LOG_PREFIX, warning);
      expect(consoleSpy.warn).toHaveBeenCalledTimes(1);
    });

    it('handles multiple arguments', () => {
      const args = ['Warning:', 'Something went wrong', { error: true }];

      contextualLogger.warn(...args);

      expect(consoleSpy.warn).toHaveBeenCalledWith(LOG_PREFIX, ...args);
    });
  });

  describe('info', () => {
    it('calls console.info with LOG_PREFIX and arguments', () => {
      const info = 'Test info message';
      const details = { status: 'success' };

      contextualLogger.info(info, details);

      expect(consoleSpy.info).toHaveBeenCalledWith(LOG_PREFIX, info, details);
      expect(consoleSpy.info).toHaveBeenCalledTimes(1);
    });

    it('handles array arguments', () => {
      const infoArray = ['info1', 'info2', 'info3'];

      contextualLogger.info('Info array:', ...infoArray);

      expect(consoleSpy.info).toHaveBeenCalledWith(
        LOG_PREFIX,
        'Info array:',
        ...infoArray,
      );
    });
  });

  describe('error', () => {
    it('calls console.error with LOG_PREFIX and arguments', () => {
      const error = new Error('Test error');
      const context = 'during sync operation';

      contextualLogger.error('Error occurred:', error, context);

      expect(consoleSpy.error).toHaveBeenCalledWith(
        LOG_PREFIX,
        'Error occurred:',
        error,
        context,
      );
      expect(consoleSpy.error).toHaveBeenCalledTimes(1);
    });

    it('handles error objects', () => {
      const error = new Error('Something went wrong');
      error.stack = 'Error stack trace';

      contextualLogger.error(error);

      expect(consoleSpy.error).toHaveBeenCalledWith(LOG_PREFIX, error);
    });
  });

  describe('debug', () => {
    it('calls console.debug with LOG_PREFIX and arguments', () => {
      const debugInfo = 'Debug information';
      const metadata = { timestamp: Date.now() };

      contextualLogger.debug(debugInfo, metadata);

      expect(consoleSpy.debug).toHaveBeenCalledWith(
        LOG_PREFIX,
        debugInfo,
        metadata,
      );
      expect(consoleSpy.debug).toHaveBeenCalledTimes(1);
    });

    it('handles performance-related debug info', () => {
      const operation = 'sync';
      const startTime = performance.now();
      const endTime = performance.now();

      contextualLogger.debug(
        `${operation} completed in ${endTime - startTime}ms`,
      );

      expect(consoleSpy.debug).toHaveBeenCalledWith(
        LOG_PREFIX,
        expect.stringContaining(`${operation} completed in`),
      );
    });
  });

  describe('all methods consistency', () => {
    it('uses the same LOG_PREFIX for all methods', () => {
      const message = 'Test message';

      contextualLogger.log(message);
      contextualLogger.warn(message);
      contextualLogger.info(message);
      contextualLogger.error(message);
      contextualLogger.debug(message);

      expect(consoleSpy.log).toHaveBeenCalledWith(LOG_PREFIX, message);
      expect(consoleSpy.warn).toHaveBeenCalledWith(LOG_PREFIX, message);
      expect(consoleSpy.info).toHaveBeenCalledWith(LOG_PREFIX, message);
      expect(consoleSpy.error).toHaveBeenCalledWith(LOG_PREFIX, message);
      expect(consoleSpy.debug).toHaveBeenCalledWith(LOG_PREFIX, message);
    });
  });
});
