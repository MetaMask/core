import type { RestrictedControllerMessenger } from '@metamask/base-controller';
import { BaseControllerV2 } from '@metamask/base-controller';

const controllerName = 'QueuedRequestController';

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
  string,
  string
>;

export type QueuedRequestControllerOptions = {
  messenger: QueuedRequestControllerMessenger;
};

/**
 * Controller for request queueing.
 */
export class QueuedRequestController extends BaseControllerV2<
  typeof controllerName,
  QueuedRequestControllerState,
  QueuedRequestControllerMessenger
> {
  private currentRequest: Promise<unknown> = Promise.resolve();

  #count = 0;

  /**
   * Construct a RequestQueueController.
   *
   * @param options - The controller options.
   * @param options.messenger - The restricted controller messenger for the QueuedRequestController
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

  // [ current batch ] - [ batch n ] - [ last batch ]
  // for new request
  // if origin is not the same as last batch origin
  // make new batch / enqueueRequest
  // otherwise, add request to the last batch

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
