import type {
  ControllerGetStateAction,
  ControllerStateChangeEvent,
  RestrictedControllerMessenger,
} from '@metamask/base-controller';
import { BaseController } from '@metamask/base-controller';
import type {
  NetworkClientId,
  NetworkControllerGetStateAction,
  NetworkControllerSetActiveNetworkAction,
} from '@metamask/network-controller';
import type { SelectedNetworkControllerStateChangeEvent } from '@metamask/selected-network-controller';
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
  | NetworkControllerSetActiveNetworkAction;

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
  shouldRequestSwitchNetwork: (
    request: QueuedRequestMiddlewareJsonRpcRequest,
  ) => boolean;
  clearPendingConfirmations: () => void;
  showApprovalRequest: () => void;
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
   * The networkClientId of the queuedRequest.
   */
  networkClientId: NetworkClientId;

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
   * The networkClientId of the current batch of requests being processed, or `undefined` if there are no
   * requests currently being processed.
   */
  #networkClientIdOfCurrentBatch?: NetworkClientId;

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
   * This is a function that returns true if a request requires the globally selected
   * network to match the dapp selected network before being processed. These can
   * be for UI/UX reasons where the currently selected network is displayed
   * in the confirmation even though it will be submitted on the correct
   * network for the dapp. It could also be that a method expects the
   * globally selected network to match some value in the request params itself.
   */
  readonly #shouldRequestSwitchNetwork: (
    request: QueuedRequestMiddlewareJsonRpcRequest,
  ) => boolean;

  /**
   * This is a function that clears all pending confirmations across
   * several controllers that may handle them.
   */
  #clearPendingConfirmations: () => void;

  /**
   * This is a function that makes the confirmation notification view
   * become visible and focused to the user
   */
  #showApprovalRequest: () => void;

  /**
   * Construct a QueuedRequestController.
   *
   * @param options - Controller options.
   * @param options.messenger - The restricted controller messenger that facilitates communication with other controllers.
   * @param options.shouldRequestSwitchNetwork - A function that returns if a request requires the globally selected network to match the dapp selected network.
   * @param options.clearPendingConfirmations - A function that will clear all the pending confirmations.
   * @param options.showApprovalRequest - A function for opening the UI such that
   * the existing request can be displayed to the user.
   */
  constructor({
    messenger,
    shouldRequestSwitchNetwork,
    clearPendingConfirmations,
    showApprovalRequest,
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

    this.#shouldRequestSwitchNetwork = shouldRequestSwitchNetwork;
    this.#clearPendingConfirmations = clearPendingConfirmations;
    this.#showApprovalRequest = showApprovalRequest;
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
            // When a domain is removed from SelectedNetworkController, its because of revoke permissions or the useRequestQueue flag was toggled off.
            // Rather than subscribe to the permissions controller event in addition to the selectedNetworkController ones, we simplify it and just handle remove on this event alone.
            if (op === 'remove' && origin === this.#originOfCurrentBatch) {
              this.#clearPendingConfirmations();
            }
          }
        });
      },
    );
  }

  // Note: since we're using queueing for multichain requests to start, this flush could incorrectly flush
  // multichain requests if the user switches networks on a dapp while multichain request is in the queue.
  // we intend to remove queueing for multichain requests in the future, so for now we have to live with this.
  #flushQueueForOrigin(flushOrigin: string) {
    this.#requestQueue
      .filter(({ origin }) => origin === flushOrigin)
      .forEach(({ processRequest }) => {
        this.#processingRequestCount -= 1;
        processRequest(
          new Error(
            'The request has been rejected due to a change in selected network. Please verify the selected network and retry the request.',
          ),
        );
      });
    this.#requestQueue = this.#requestQueue.filter(
      ({ origin }) => origin !== flushOrigin,
    );
    this.#originOfCurrentBatch = undefined;
    this.#networkClientIdOfCurrentBatch = undefined;
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
    this.#networkClientIdOfCurrentBatch = firstRequest.networkClientId;
    const batch = [firstRequest.processRequest];

    // alternatively we could still batch by only origin but switch networks in batches by
    // adding the network clientId to the values in the batch array
    while (
      this.#requestQueue[0]?.networkClientId ===
        this.#networkClientIdOfCurrentBatch &&
      this.#requestQueue[0]?.origin === this.#originOfCurrentBatch
    ) {
      const nextEntry = this.#requestQueue.shift() as QueuedRequest;
      batch.push(nextEntry.processRequest);
    }
    // If globally selected network is different from origin selected network,
    // switch network before processing batch
    let networkSwitchError: unknown;
    try {
      await this.#switchNetworkIfNecessary(firstRequest.networkClientId);
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
   * @param requestNetworkClientId - the networkClientId of the next request to process.
   * @throws Throws an error if the current selected `networkClientId` or the
   * `networkClientId` on the request are invalid.
   */
  async #switchNetworkIfNecessary(requestNetworkClientId: NetworkClientId) {
    const { selectedNetworkClientId } = this.messagingSystem.call(
      'NetworkController:getState',
    );

    if (requestNetworkClientId === selectedNetworkClientId) {
      return;
    }

    await this.messagingSystem.call(
      'NetworkController:setActiveNetwork',
      requestNetworkClientId,
    );

    this.messagingSystem.publish(
      'QueuedRequestController:networkSwitched',
      requestNetworkClientId,
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

  async #waitForDequeue({
    origin,
    networkClientId,
  }: {
    origin: string;
    networkClientId: NetworkClientId;
  }): Promise<void> {
    const { promise, reject, resolve } = createDeferredPromise({
      suppressUnhandledRejection: true,
    });
    this.#requestQueue.push({
      origin,
      networkClientId,
      processRequest: (error: unknown) => {
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      },
    });
    this.#updateQueuedRequestCount();

    return promise;
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
    if (request.networkClientId === undefined) {
      // This error will occur if selectedNetworkMiddleware does not precede queuedRequestMiddleware in the middleware stack
      throw new Error(
        'Error while attempting to enqueue request: networkClientId is required.',
      );
    }
    if (this.#originOfCurrentBatch === undefined) {
      this.#originOfCurrentBatch = request.origin;
    }
    if (this.#networkClientIdOfCurrentBatch === undefined) {
      this.#networkClientIdOfCurrentBatch = request.networkClientId;
    }

    try {
      // Queue request for later processing
      // Network switch is handled when this batch is processed
      if (
        this.state.queuedRequestCount > 0 ||
        this.#originOfCurrentBatch !== request.origin ||
        this.#networkClientIdOfCurrentBatch !== request.networkClientId
      ) {
        this.#showApprovalRequest();
        await this.#waitForDequeue({
          origin: request.origin,
          networkClientId: request.networkClientId,
        });
      } else if (this.#shouldRequestSwitchNetwork(request)) {
        // Process request immediately
        // Requires switching network now if necessary
        await this.#switchNetworkIfNecessary(request.networkClientId);
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
        this.#networkClientIdOfCurrentBatch = undefined;
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
