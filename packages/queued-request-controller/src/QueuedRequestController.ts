import type { AddApprovalRequest } from '@metamask/approval-controller';
import type {
  ControllerGetStateAction,
  ControllerStateChangeEvent,
  RestrictedControllerMessenger,
} from '@metamask/base-controller';
import { BaseController } from '@metamask/base-controller';
import { ApprovalType } from '@metamask/controller-utils';
import type {
  NetworkControllerGetNetworkConfigurationByNetworkClientId,
  NetworkControllerGetStateAction,
  NetworkControllerSetActiveNetworkAction,
} from '@metamask/network-controller';
import type { SelectedNetworkControllerGetNetworkClientIdForDomainAction } from '@metamask/selected-network-controller';
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
  stateChange: `${controllerName}:stateChange` as const,
};

export type QueuedRequestControllerStateChangeEvent =
  ControllerStateChangeEvent<
    typeof controllerName,
    QueuedRequestControllerState
  >;

export type QueuedRequestControllerEvents =
  QueuedRequestControllerStateChangeEvent;

export type QueuedRequestControllerActions =
  | QueuedRequestControllerGetStateAction
  | QueuedRequestControllerEnqueueRequestAction;

export type AllowedActions =
  | NetworkControllerGetStateAction
  | NetworkControllerSetActiveNetworkAction
  | NetworkControllerGetNetworkConfigurationByNetworkClientId
  | SelectedNetworkControllerGetNetworkClientIdForDomainAction
  | AddApprovalRequest;

export type QueuedRequestControllerMessenger = RestrictedControllerMessenger<
  typeof controllerName,
  QueuedRequestControllerActions | AllowedActions,
  QueuedRequestControllerEvents,
  AllowedActions['type'],
  never
>;

export type QueuedRequestControllerOptions = {
  messenger: QueuedRequestControllerMessenger;
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
   * Constructs a QueuedRequestController, responsible for managing and processing enqueued requests sequentially.
   * @param options - The controller options, including the restricted controller messenger for the QueuedRequestController.
   * @param options.messenger - The restricted controller messenger that facilitates communication with the QueuedRequestController.
   */
  constructor({ messenger }: QueuedRequestControllerOptions) {
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
    this.#registerMessageHandlers();
  }

  #registerMessageHandlers(): void {
    this.messagingSystem.registerActionHandler(
      QueuedRequestControllerActionTypes.enqueueRequest,
      this.enqueueRequest.bind(this),
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

    batch.map(async (processRequest) => {
      // These promises are handled as the return value of `#enqueueRequest`
      // We don't need to handle them here
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      processRequest(networkSwitchError);
    });
    this.#updateCount();
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

    const toNetworkConfiguration = this.messagingSystem.call(
      'NetworkController:getNetworkConfigurationByNetworkClientId',
      originNetworkClientId,
    );
    const fromNetworkConfiguration = this.messagingSystem.call(
      'NetworkController:getNetworkConfigurationByNetworkClientId',
      selectedNetworkClientId,
    );
    if (!toNetworkConfiguration) {
      throw new Error(
        `Missing network configuration for ${originNetworkClientId}`,
      );
    } else if (!fromNetworkConfiguration) {
      throw new Error(
        `Missing network configuration for ${selectedNetworkClientId}`,
      );
    }

    const requestData = {
      toNetworkConfiguration,
      fromNetworkConfiguration,
    };
    await this.messagingSystem.call(
      'ApprovalController:addRequest',
      {
        origin: this.#originOfCurrentBatch,
        type: ApprovalType.SwitchEthereumChain,
        requestData,
      },
      true,
    );

    await this.messagingSystem.call(
      'NetworkController:setActiveNetwork',
      originNetworkClientId,
    );
  }

  /**
   * Update the queued request count.
   */
  #updateCount() {
    this.update((state) => {
      state.queuedRequestCount = this.#requestQueue.length;
    });
  }

  /**
   * Enqueue a request to be processed in a batch with other requests from the same origin.
   *
   * We process requests one origin at a time, so that requests from different origins do not get
   * interwoven, and so that we can ensure that the globally selected network matches the dapp-
   * selected network. Request are executed in exactly the same order they come in.
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
        this.#updateCount();

        await waitForDequeue;
      } else {
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
