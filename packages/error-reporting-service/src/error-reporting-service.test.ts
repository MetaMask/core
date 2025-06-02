import { Messenger } from '@metamask/base-controller';
import { captureException as sentryCaptureException } from '@sentry/core';

import type { ErrorReportingServiceMessenger } from './error-reporting-service';
import { ErrorReportingService } from './error-reporting-service';

describe('ErrorReportingService', () => {
  describe('constructor', () => {
    it('allows the Sentry captureException function to be passed', () => {
      const messenger = buildMessenger();
      const errorReportingService = new ErrorReportingService({
        messenger,
        captureException: sentryCaptureException,
      });

      // This assertion is just here to appease the ESLint Jest rules
      expect(errorReportingService).toBeInstanceOf(ErrorReportingService);
    });
  });

  describe('captureException', () => {
    it('calls the captureException function supplied to the constructor with the given arguments', () => {
      const messenger = buildMessenger();
      const captureExceptionMock = jest.fn();
      const errorReportingService = new ErrorReportingService({
        messenger,
        captureException: captureExceptionMock,
      });
      const error = new Error('some error');

      errorReportingService.captureException(error);

      expect(captureExceptionMock).toHaveBeenCalledWith(error);
    });
  });

  describe('ErrorReportingService:captureException', () => {
    it('calls the captureException function supplied to the constructor with the given arguments', () => {
      const messenger = buildMessenger();
      const captureExceptionMock = jest.fn();
      new ErrorReportingService({
        messenger,
        captureException: captureExceptionMock,
      });
      const error = new Error('some error');

      messenger.call('ErrorReportingService:captureException', error);

      expect(captureExceptionMock).toHaveBeenCalledWith(error);
    });
  });
});

/**
 * Builds a messenger suited to the ErrorReportingService.
 *
 * @returns The messenger.
 */
function buildMessenger(): ErrorReportingServiceMessenger {
  return new Messenger().getRestricted({
    name: 'ErrorReportingService',
    allowedActions: [],
    allowedEvents: [],
  });
}
