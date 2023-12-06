import type { RestrictedControllerMessenger } from '@metamask/base-controller';
import { BaseController } from '@metamask/base-controller';

export const controllerName = 'QueuedRequestController';

export const QueuedRequestControllerActionTypes = {
  enqueueRequest: `${controllerName}:enqueueRequest` as const,
};

export const QueuedRequestControllerEventTypes = {
  countChanged: `${controllerName}:countChanged` as const,
};

export type QueuedRequestControllerState = Record<string, never>;

export type QueuedRequestControllerCountChangedEvent = {
  type: typeof QueuedRequestControllerEventTypes.countChanged;
  payload: [number];
};

export type QueuedRequestControllerEnqueueRequestAction = {
  type: typeof QueuedRequestControllerActionTypes.enqueueRequest;
  handler: QueuedRequestController['enqueueRequest'];
};

export type QueuedRequestControllerEvents =
  QueuedRequestControllerCountChangedEvent;

export type QueuedRequestControllerActions =
  QueuedRequestControllerEnqueueRequestAction;

export type QueuedRequestControllerMessenger = RestrictedControllerMessenger<
  typeof controllerName,
  QueuedRequestControllerActions,
  QueuedRequestControllerEvents,
  never,
  never
>;

export type QueuedRequestControllerOptions = {
  messenger: QueuedRequestControllerMessenger;
};

/**
 * Controller for request queueing. The QueuedRequestController manages the orderly execution of enqueued requests
 * to prevent concurrency issues and ensure proper handling of asynchronous operations.
 *
 * @param options - The controller options, including the restricted controller messenger for the QueuedRequestController.
 * @param options.messenger - The restricted controller messenger that facilitates communication with the QueuedRequestController.
 *
 * The QueuedRequestController maintains a count of enqueued requests, allowing you to monitor the queue's workload.
 * It processes requests sequentially, ensuring that each request is executed one after the other. The class offers
 * an `enqueueRequest` method for adding requests to the queue. The controller initializes with a count of zero and
 * registers message handlers for request enqueuing. It also publishes count changes to inform external observers.
 */
export class QueuedRequestController extends BaseController<
  typeof controllerName,
  QueuedRequestControllerState,
  QueuedRequestControllerMessenger
> {
  private currentRequest: Promise<unknown> = Promise.resolve();

  #count = 0;

  /**
   * Constructs a QueuedRequestController, responsible for managing and processing enqueued requests sequentially.
   * @param options - The controller options, including the restricted controller messenger for the QueuedRequestController.
   * @param options.messenger - The restricted controller messenger that facilitates communication with the QueuedRequestController.
   */
  constructor({ messenger }: QueuedRequestControllerOptions) {
    super({
      name: controllerName,
      metadata: {},
      messenger,
      state: {},
    });
    this.#registerMessageHandlers();
  }

  #registerMessageHandlers(): void {
    this.messagingSystem.registerActionHandler(
      QueuedRequestControllerActionTypes.enqueueRequest,
      this.enqueueRequest.bind(this),
    );
  }

  /**
   * Gets the current count of enqueued requests in the request queue. This count represents the number of
   * pending requests that are waiting to be processed sequentially.
   *
   * @returns The current count of enqueued requests. This count reflects the number of pending
   * requests in the queue, which are yet to be processed. It allows you to monitor the queue's workload
   * and assess the volume of requests awaiting execution.
   */
  length() {
    return this.#count;
  }

  #updateCount(change: -1 | 1) {
    this.#count += change;
    this.messagingSystem.publish(
      'QueuedRequestController:countChanged',
      this.#count,
    );
  }

  /**
   * Enqueues a new request for sequential processing in the request queue. This function manages the order of
   * requests, ensuring they are executed one after the other to prevent concurrency issues and maintain proper
   * execution flow.
   *
   * @param requestNext - A function representing the request to be enqueued. It returns a promise that
   * resolves when the request is complete.
   * @returns A promise that resolves when the enqueued request and any subsequent asynchronous
   * operations are fully processed. This allows you to await the completion of the enqueued request before continuing
   * with additional actions. If there are multiple enqueued requests, this function ensures they are processed in
   * the order they were enqueued, guaranteeing sequential execution.
   */
  async enqueueRequest(requestNext: (...arg: unknown[]) => Promise<unknown>) {
    this.#updateCount(1);

    if (this.#count > 1) {
      await this.currentRequest;
    }

    this.currentRequest = requestNext()
      .then(() => {
        this.#updateCount(-1);
      })
      .catch((e) => {
        this.#updateCount(-1);
        throw e;
      });

    await this.currentRequest;
  }
}
