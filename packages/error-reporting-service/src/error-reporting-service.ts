import type { RestrictedMessenger } from '@metamask/base-controller';

/**
 * The action which can be used to report an error.
 */
export type ErrorReportingServiceCaptureExceptionAction = {
  type: 'ErrorReportingService:captureException';
  handler: ErrorReportingService['captureException'];
};

/**
 * All actions that {@link ErrorReportingService} registers so that other
 * modules can call them.
 */
export type ErrorReportingServiceActions =
  ErrorReportingServiceCaptureExceptionAction;

/**
 * All events that {@link ErrorReportingService} publishes so that other modules
 * can subscribe to them.
 */
export type ErrorReportingServiceEvents = never;

/**
 * All actions registered by other modules that {@link ErrorReportingService}
 * calls.
 */
type AllowedActions = never;

/**
 * All events published by other modules that {@link ErrorReportingService}
 * subscribes to.
 */
type AllowedEvents = never;

/**
 * The messenger restricted to actions and events that
 * {@link ErrorReportingService} needs to access.
 */
export type ErrorReportingServiceMessenger = RestrictedMessenger<
  'ErrorReportingService',
  ErrorReportingServiceActions | AllowedActions,
  ErrorReportingServiceEvents | AllowedEvents,
  AllowedActions['type'],
  AllowedEvents['type']
>;

/**
 * The options that {@link ErrorReportingService} takes.
 */
type ErrorReportingServiceOptions = {
  captureException: (error: unknown) => string;
  messenger: ErrorReportingServiceMessenger;
};

/**
 * `ErrorReportingService` is designed to log an error to an error reporting app
 * such as Sentry, but in an agnostic fashion.
 *
 * @example
 *
 * In this example, we have a controller, and something bad happens, but we want
 * to report an error instead of throwing it.
 *
 * ``` ts
 * // === Controller file ===
 *
 * import type { ErrorReportingServiceCaptureExceptionAction } from '@metamask/error-reporting-service';
 *
 * // Define the messenger type for the controller.
 * type AllowedActions = ErrorReportingServiceCaptureExceptionAction;
 * type ExampleControllerMessenger = RestrictedMessenger<
 *   'ExampleController',
 *   AllowedActions,
 *   never,
 *   AllowedActions['type'],
 *   never
 * >;
 *
 * // Define the controller.
 * class ExampleController extends BaseController<
 *   'ExampleController',
 *   ExampleControllerState,
 *   ExampleControllerMessenger
 * > {
 *   doSomething() {
 *     // Imagine that we do something that produces an error and we want to
 *     // report the error.
 *     this.messagingSystem.call(
 *       'ErrorReportingService:captureException',
 *       new Error('Something went wrong'),
 *     );
 *   }
 * }
 *
 * // === Initialization file ===
 *
 * import { captureException } from '@sentry/browser';
 * import { ErrorReportingService } from '@metamask/error-reporting-service';
 * import { ExampleController } from './example-controller';
 *
 * // Create a global messenger.
 * const globalMessenger = new Messenger();
 *
 * // Register handler for the `ErrorReportingService:captureException`
 * // action in the global messenger.
 * const errorReportingServiceMessenger = globalMessenger.getRestricted({
 *   allowedActions: [],
 *   allowedEvents: [],
 * });
 * const errorReportingService = new ErrorReportingService({
 *   messenger: errorReportingServiceMessenger,
 *   captureException,
 * });
 *
 * const exampleControllerMessenger = globalMessenger.getRestricted({
 *   allowedActions: ['ErrorReportingService:captureException'],
 *   allowedEvents: [],
 * });
 * const exampleController = new ExampleController({
 *   messenger: exampleControllerMessenger,
 * });
 *
 * // === Somewhere else ===
 *
 * // Now this will report an error without throwing it.
 * exampleController.doSomething();
 * ```
 */
export class ErrorReportingService {
  readonly #captureException: ErrorReportingServiceOptions['captureException'];

  readonly #messenger: ErrorReportingServiceMessenger;

  /**
   * Constructs a new ErrorReportingService.
   *
   * @param options - The options.
   * @param options.messenger - The messenger suited to this
   * ErrorReportingService.
   * @param options.captureException - A function that stores the given error in
   * the error reporting service.
   */
  constructor({ messenger, captureException }: ErrorReportingServiceOptions) {
    this.#messenger = messenger;
    this.#captureException = captureException;

    this.#messenger.registerActionHandler(
      'ErrorReportingService:captureException',
      this.#captureException.bind(this),
    );
  }

  /**
   * Reports the given error to an external location.
   *
   * @param error - The error to report.
   */
  captureException(error: Error): void {
    this.#captureException(error);
  }
}
