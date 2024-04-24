import type {
  ControllerGetStateAction,
  ControllerStateChangeEvent,
  RestrictedControllerMessenger,
} from '@metamask/base-controller';
import { BaseController } from '@metamask/base-controller';
import type {
  NetworkControllerGetStateAction,
  NetworkControllerSetActiveNetworkAction,
} from '@metamask/network-controller';
import type {
  SelectedNetworkControllerGetNetworkClientIdForDomainAction,
  SelectedNetworkControllerStateChangeEvent,
} from '@metamask/selected-network-controller';
import { SelectedNetworkControllerEventTypes } from '@metamask/selected-network-controller';
import { createDeferredPromise } from '@metamask/utils';

import type { QueuedRequestMiddlewareJsonRpcRequest } from './types';

export const controllerName = 'QueuedRequestController';

export type QueuedRequestControllerState = {
  queuedRequestCount: number;
};

export const QueuedRequestControllerActionTypes = {
  enqueueRequest: `${controllerName}:enqueueRequest` as const,
  getState: `${controllerName}:getState` as const,
};

export type QueuedRequestControllerGetStateAction = ControllerGetStateAction<
  typeof controllerName,
  QueuedRequestControllerState
>;

export type QueuedRequestControllerEnqueueRequestAction = {
  type: typeof QueuedRequestControllerActionTypes.enqueueRequest;
  handler: QueuedRequestController['enqueueRequest'];
};

export const QueuedRequestControllerEventTypes = {
  networkSwitched: `${controllerName}:networkSwitched` as const,
  stateChange: `${controllerName}:stateChange` as const,
};

export type QueuedRequestControllerStateChangeEvent =
  ControllerStateChangeEvent<
    typeof controllerName,
    QueuedRequestControllerState
  >;

export type QueuedRequestControllerNetworkSwitched = {
  type: typeof QueuedRequestControllerEventTypes.networkSwitched;
  payload: [string];
};

export type QueuedRequestControllerEvents =
  | QueuedRequestControllerStateChangeEvent
  | QueuedRequestControllerNetworkSwitched;

export type QueuedRequestControllerActions =
  | QueuedRequestControllerGetStateAction
  | QueuedRequestControllerEnqueueRequestAction;

export type AllowedActions =
  | NetworkControllerGetStateAction
  | NetworkControllerSetActiveNetworkAction
  | SelectedNetworkControllerGetNetworkClientIdForDomainAction;

export type AllowedEvents = SelectedNetworkControllerStateChangeEvent;

export type QueuedRequestControllerMessenger = RestrictedControllerMessenger<
  typeof controllerName,
  QueuedRequestControllerActions | AllowedActions,
  QueuedRequestControllerEvents | AllowedEvents,
  AllowedActions['type'],
  AllowedEvents['type']
>;

export type QueuedRequestControllerOptions = {
  messenger: QueuedRequestControllerMessenger;
  methodsRequiringNetworkSwitch: string[];
  clearPendingConfirmations: () => void;
};

/**
 * A queued request.
 */
type QueuedRequest = {
  /**
   * The origin of the queued request.
   */
  origin: string;
  /**
   * A callback used to continue processing the request, called when the request is dequeued.
   */
  processRequest: (error: unknown) => void;
};

/**
 * Queue requests for processing in batches, by request origin.
 *
 * Processing requests in batches allows us to completely separate sets of requests that originate
 * from different origins. This ensures that our UI will not display those requests as a set, which
 * could mislead users into thinking they are related.
 *
 * Queuing requests in batches also allows us to ensure the globally selected network matches the
 * dapp-selected network, before the confirmation UI is rendered. This is important because the
 * data shown on some confirmation screens is only collected for the globally selected network.
 *
 * Requests get processed in order of insertion, even across batches. All requests get processed
 * even in the event of preceding requests failing.
 */
export class QueuedRequestController extends BaseController<
  typeof controllerName,
  QueuedRequestControllerState,
  QueuedRequestControllerMessenger
> {
  /**
   * The origin of the current batch of requests being processed, or `undefined` if there are no
   * requests currently being processed.
   */
  #originOfCurrentBatch: string | undefined;

  /**
   * The list of all queued requests, in chronological order.
   */
  #requestQueue: QueuedRequest[] = [];

  /**
   * The number of requests currently being processed.
   *
   * Note that this does not include queued requests, just those being actively processed (i.e.
   * those in the "current batch").
   */
  #processingRequestCount = 0;

  /**
   * This is a list of methods that require the globally selected network
   * to match the dapp selected network before being processed. These can
   * be for UI/UX reasons where the currently selected network is displayed
   * in the confirmation even though it will be submitted on the correct
   * network for the dapp. It could also be that a method expects the
   * globally selected network to match some value in the request params itself.
   */
  readonly #methodsRequiringNetworkSwitch: string[];

  #clearPendingConfirmations: () => void;

  /**
   * Construct a QueuedRequestController.
   *
   * @param options - Controller options.
   * @param options.messenger - The restricted controller messenger that facilitates communication with other controllers.
   * @param options.methodsRequiringNetworkSwitch - A list of methods that require the globally selected network to match the dapp selected network.
   * @param options.clearPendingConfirmations - A function that will clear all the pending confirmations.
   */
  constructor({
    messenger,
    methodsRequiringNetworkSwitch,
    clearPendingConfirmations,
  }: QueuedRequestControllerOptions) {
    super({
      name: controllerName,
      metadata: {
        queuedRequestCount: {
          anonymous: true,
          persist: false,
        },
      },
      messenger,
      state: { queuedRequestCount: 0 },
    });
    this.#methodsRequiringNetworkSwitch = methodsRequiringNetworkSwitch;
    this.#clearPendingConfirmations = clearPendingConfirmations;
    this.#registerMessageHandlers();
  }

  #registerMessageHandlers(): void {
    this.messagingSystem.registerActionHandler(
      `${controllerName}:enqueueRequest`,
      this.enqueueRequest.bind(this),
    );

    this.messagingSystem.subscribe(
      SelectedNetworkControllerEventTypes.stateChange,
      (_, patch) => {
        patch.forEach(({ op, path }) => {
          if (
            path.length === 2 &&
            path[0] === 'domains' &&
            typeof path[1] === 'string'
          ) {
            const origin = path[1];
            this.#flushQueueForOrigin(origin);
            // When a domain is removed from SelectedNetworkController, its because of revoke permissions.
            // Rather than subscribe to the permissions controller event in addition to the selectedNetworkController ones, we simplify it and just handle remove on this event alone.
            if (op === 'remove' && origin === this.#originOfCurrentBatch) {
              this.#clearPendingConfirmations();
            }
          }
        });
      },
    );
  }

  #flushQueueForOrigin(flushOrigin: string) {
    this.#requestQueue
      .filter(({ origin }) => origin === flushOrigin)
      .forEach(({ processRequest }) => {
        processRequest(
          new Error(
            'The request has been rejected due to a change in selected network. Please verify the selected network and retry the request.',
          ),
        );
      });
    this.#requestQueue = this.#requestQueue.filter(
      ({ origin }) => origin !== flushOrigin,
    );
  }

  /**
   * Process the next batch of requests.
   *
   * This will trigger the next batch of requests with matching origins to be processed. Each
   * request in the batch is dequeued one at a time, in chronological order, but they all get
   * processed in parallel.
   *
   * This should be called after a batch of requests has finished processing, if the queue is non-
   * empty.
   */
  async #processNextBatch() {
    const firstRequest = this.#requestQueue.shift() as QueuedRequest;
    this.#originOfCurrentBatch = firstRequest.origin;
    const batch = [firstRequest.processRequest];
    while (this.#requestQueue[0]?.origin === this.#originOfCurrentBatch) {
      const nextEntry = this.#requestQueue.shift() as QueuedRequest;
      batch.push(nextEntry.processRequest);
    }

    // If globally selected network is different from origin selected network,
    // switch network before processing batch
    let networkSwitchError: unknown;
    try {
      await this.#switchNetworkIfNecessary();
    } catch (error: unknown) {
      networkSwitchError = error;
    }

    for (const processRequest of batch) {
      processRequest(networkSwitchError);
    }
    this.#updateQueuedRequestCount();
  }

  /**
   * Switch the globally selected network client to match the network
   * client of the current batch.
   *
   * @throws Throws an error if the current selected `networkClientId` or the
   * `networkClientId` on the request are invalid.
   */
  async #switchNetworkIfNecessary() {
    // This branch is unreachable; it's just here for type reasons.
    /* istanbul ignore next */
    if (!this.#originOfCurrentBatch) {
      throw new Error('Current batch origin must be initialized first');
    }
    const originNetworkClientId = this.messagingSystem.call(
      'SelectedNetworkController:getNetworkClientIdForDomain',
      this.#originOfCurrentBatch,
    );
    const { selectedNetworkClientId } = this.messagingSystem.call(
      'NetworkController:getState',
    );
    if (originNetworkClientId === selectedNetworkClientId) {
      return;
    }

    await this.messagingSystem.call(
      'NetworkController:setActiveNetwork',
      originNetworkClientId,
    );

    this.messagingSystem.publish(
      'QueuedRequestController:networkSwitched',
      originNetworkClientId,
    );
  }

  /**
   * Update the queued request count.
   */
  #updateQueuedRequestCount() {
    this.update((state) => {
      state.queuedRequestCount = this.#requestQueue.length;
    });
  }

  /**
   * Enqueue a request to be processed in a batch with other requests from the same origin.
   *
   * We process requests one origin at a time, so that requests from different origins do not get
   * interwoven, and so that we can ensure that the globally selected network matches the dapp-
   * selected network.
   *
   * Requests get processed in order of insertion, even across origins/batches. All requests get
   * processed even in the event of preceding requests failing.
   *
   * @param request - The JSON-RPC request to process.
   * @param requestNext - A function representing the next steps for processing this request.
   * @returns A promise that resolves when the given request has been fully processed.
   */
  async enqueueRequest(
    request: QueuedRequestMiddlewareJsonRpcRequest,
    requestNext: () => Promise<void>,
  ): Promise<void> {
    if (this.#originOfCurrentBatch === undefined) {
      this.#originOfCurrentBatch = request.origin;
    }

    try {
      // Queue request for later processing
      // Network switch is handled when this batch is processed
      if (
        this.state.queuedRequestCount > 0 ||
        this.#originOfCurrentBatch !== request.origin
      ) {
        const {
          promise: waitForDequeue,
          reject,
          resolve,
        } = createDeferredPromise({
          suppressUnhandledRejection: true,
        });
        this.#requestQueue.push({
          origin: request.origin,
          processRequest: (error: unknown) => {
            if (error) {
              reject(error);
            } else {
              resolve();
            }
          },
        });
        this.#updateQueuedRequestCount();

        await waitForDequeue;
      } else if (this.#methodsRequiringNetworkSwitch.includes(request.method)) {
        // Process request immediately
        // Requires switching network now if necessary
        await this.#switchNetworkIfNecessary();
      }
      this.#processingRequestCount += 1;
      try {
        await requestNext();
      } finally {
        this.#processingRequestCount -= 1;
      }
      return undefined;
    } finally {
      if (this.#processingRequestCount === 0) {
        this.#originOfCurrentBatch = undefined;
        if (this.#requestQueue.length > 0) {
          // The next batch is triggered here. We intentionally omit the `await` because we don't
          // want the next batch to block resolution of the current request.
          // eslint-disable-next-line @typescript-eslint/no-floating-promises
          this.#processNextBatch();
        }
      }
    }
  }
}
