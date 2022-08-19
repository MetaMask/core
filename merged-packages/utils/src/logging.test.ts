import { MockWritable } from 'stdio-mock';
import { createProjectLogger, createModuleLogger } from './logging';

describe('logging', () => {
  beforeEach(() => {
    jest.useFakeTimers({ now: new Date('2022-01-01') });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('createProjectLogger', () => {
    it('returns an object that can be used for logging', () => {
      const writer = new MockWritable();
      const log = createProjectLogger('some-project');
      log.log = writer.write.bind(writer);
      log.enabled = true;
      // Typecast: The Debugger type is wrong and does not include a `useColors`
      // property.
      (log as any).useColors = false;

      log('Some message');

      expect(writer.data()).toStrictEqual([
        '2022-01-01T00:00:00.000Z metamask:some-project Some message',
      ]);
    });
  });

  describe('createModuleLogger', () => {
    it('returns an object that can be used for logging', () => {
      const writer = new MockWritable();
      const projectLogger = createProjectLogger('some-project');
      const log = createModuleLogger(projectLogger, 'some-module');
      log.log = writer.write.bind(writer);
      log.enabled = true;
      // Typecast: The Debugger type is wrong and does not include a `useColors`
      // property.
      (log as any).useColors = false;

      log('Some message');

      expect(writer.data()).toStrictEqual([
        '2022-01-01T00:00:00.000Z metamask:some-project:some-module Some message',
      ]);
    });
  });
});
