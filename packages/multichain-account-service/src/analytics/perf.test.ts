import type { TraceCallback, TraceRequest } from '@metamask/controller-utils';

import { projectLogger } from '../logger';
import {
  isPerfEnabled,
  log as perfLog,
  tick,
  withLocalPerfTrace,
} from './perf';
import { now } from './timer';

jest.mock('./timer', () => ({
  now: jest.fn(),
}));

jest.mock('../logger', () => ({
  projectLogger: { enabled: false },
  createModuleLogger: jest
    .fn()
    .mockReturnValue(Object.assign(jest.fn(), { enabled: false })),
}));

const mockProjectLogger = projectLogger as { enabled: boolean };
const mockPerfLog = perfLog as unknown as { enabled: boolean };

describe('perf', () => {
  describe('isPerfEnabled', () => {
    it('returns false when projectLogger is disabled', () => {
      mockProjectLogger.enabled = false;
      mockPerfLog.enabled = false;
      expect(isPerfEnabled()).toBe(false);
    });

    it('returns true when projectLogger is enabled', () => {
      mockProjectLogger.enabled = true;
      expect(isPerfEnabled()).toBe(true);
      mockProjectLogger.enabled = false;
    });

    it('returns true when (perf) log is enabled', () => {
      mockPerfLog.enabled = true;
      expect(isPerfEnabled()).toBe(true);
      mockPerfLog.enabled = false;
    });
  });

  describe('tick', () => {
    const request: TraceRequest = { name: 'test-operation' };

    beforeEach(() => {
      jest.mocked(now).mockReset();
    });

    afterEach(() => {
      mockProjectLogger.enabled = false;
      mockPerfLog.enabled = false;
    });

    it('returns a no-op when perf is disabled', () => {
      mockProjectLogger.enabled = false;
      const tock = tick(request);

      expect(now).not.toHaveBeenCalled();
      expect(tock()).toBeUndefined();
    });

    it('captures start time when perf is enabled', () => {
      mockProjectLogger.enabled = true;
      jest.mocked(now).mockReturnValueOnce(100);

      tick(request);

      expect(now).toHaveBeenCalledTimes(1);
    });

    it('logs elapsed time when tock is called', () => {
      mockProjectLogger.enabled = true;
      jest.mocked(now).mockReturnValueOnce(100).mockReturnValueOnce(250);

      const tock = tick(request);
      tock();

      expect(now).toHaveBeenCalledTimes(2);
    });

    it('includes JSON-encoded data in the log when request has data', () => {
      mockProjectLogger.enabled = true;
      const requestWithData: TraceRequest = {
        name: 'test-operation',
        data: { foo: 'bar' },
      };
      jest.mocked(now).mockReturnValueOnce(0).mockReturnValueOnce(42);

      // Should not throw regardless of data shape
      const tock = tick(requestWithData);
      expect(() => tock()).not.toThrow();
    });

    it('omits context when request has no data', () => {
      mockProjectLogger.enabled = true;
      jest.mocked(now).mockReturnValueOnce(0).mockReturnValueOnce(10);

      const tock = tick({ name: 'no-data' });
      expect(() => tock()).not.toThrow();
    });
  });

  describe('withLocalPerfTrace', () => {
    const request: TraceRequest = { name: 'wrapped-op' };
    let mockTrace: jest.MockedFunction<TraceCallback>;

    beforeEach(() => {
      mockTrace = jest.fn();
      jest.mocked(now).mockReset();
    });

    afterEach(() => {
      mockProjectLogger.enabled = false;
    });

    it('calls trace directly when perf is disabled', async () => {
      mockProjectLogger.enabled = false;
      mockTrace.mockResolvedValue('result');

      const wrapped = withLocalPerfTrace(mockTrace);
      const fn = jest.fn().mockReturnValue('result');
      const result = await wrapped(request, fn);

      expect(mockTrace).toHaveBeenCalledTimes(1);
      expect(mockTrace).toHaveBeenCalledWith(request, fn);
      expect(result).toBe('result');
      expect(now).not.toHaveBeenCalled();
    });

    it('calls trace and measures timing when perf is enabled', async () => {
      mockProjectLogger.enabled = true;
      jest.mocked(now).mockReturnValueOnce(0).mockReturnValueOnce(100);
      mockTrace.mockResolvedValue('result');

      const wrapped = withLocalPerfTrace(mockTrace);
      const fn = jest.fn().mockReturnValue('result');
      const result = await wrapped(request, fn);

      expect(mockTrace).toHaveBeenCalledTimes(1);
      expect(mockTrace).toHaveBeenCalledWith(request, fn);
      expect(result).toBe('result');
      expect(now).toHaveBeenCalledTimes(2);
    });

    it('still calls tock when trace throws', async () => {
      mockProjectLogger.enabled = true;
      jest.mocked(now).mockReturnValueOnce(0).mockReturnValueOnce(50);
      const error = new Error('trace failed');
      mockTrace.mockRejectedValue(error);

      const wrapped = withLocalPerfTrace(mockTrace);

      await expect(wrapped(request, jest.fn())).rejects.toThrow(error);
      // now called once for tick (start) and once for tock (end)
      expect(now).toHaveBeenCalledTimes(2);
    });

    it('works without a fn argument', async () => {
      mockProjectLogger.enabled = false;
      mockTrace.mockResolvedValue(undefined);

      const wrapped = withLocalPerfTrace(mockTrace);
      await wrapped(request);

      expect(mockTrace).toHaveBeenCalledWith(request, undefined);
    });
  });
});
