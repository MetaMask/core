import type { RestrictedControllerMessenger } from '@metamask/base-controller';
import { BaseControllerV2 } from '@metamask/base-controller';
import type { Json } from '@metamask/utils';
import type { Patch } from 'immer';

const controllerName = 'QueuedRequestController';

// should serialize and persist these values.
const stateMetadata = {
  queue: { persist: false, anonymous: false },
};

const getDefaultState = () => ({});

export const QueuedRequestControllerActionTypes = {
  enqueueRequest: `${controllerName}:enqueueRequest` as const,
};

export const QueuedRequestControllerEventTypes = {
  stateChange: `${controllerName}:stateChange` as const,
  countChanged: `${controllerName}:countChanged` as const,
};

export type QueuedRequestControllerState = {
  [k: string]: Json;
};

export type QueuedRequestControllerStateChangeEvent = {
  type: typeof QueuedRequestControllerEventTypes.stateChange;
  payload: [QueuedRequestControllerState, Patch[]];
};

export type QueuedRequestControllerCountChangedEvent = {
  type: typeof QueuedRequestControllerEventTypes.countChanged;
  payload: [number];
};

export type QueuedRequestControllerEnqueueRequestAction = {
  type: typeof QueuedRequestControllerActionTypes.enqueueRequest;
  handler: QueuedRequestController['enqueueRequest'];
};

export type QueuedRequestControllerEvents =
  | QueuedRequestControllerStateChangeEvent
  | QueuedRequestControllerCountChangedEvent;

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
 * Controller for requesting encryption public key requests requiring user approval.
 */
export class QueuedRequestController extends BaseControllerV2<
  typeof controllerName,
  QueuedRequestControllerState,
  QueuedRequestControllerMessenger
> {
  private currentRequest: Promise<unknown> = Promise.resolve();

  private count = 0;

  /**
   * Construct a EncryptionPublicKey controller.
   *
   * @param options - The controller options.
   * @param options.messenger - The restricted controller messenger for the QueuedRequestController
   */
  constructor({ messenger }: QueuedRequestControllerOptions) {
    super({
      name: controllerName,
      metadata: stateMetadata,
      messenger,
      state: getDefaultState(),
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
    return this.count;
  }

  // [ current batch ] - [ batch n ] - [ last batch ]
  // for new request
  // if origin is not the same as last batch origin
  // make new batch / enqueueRequest
  // otherwise, add request to the last batch

  async enqueueRequest(requestNext: (...arg: unknown[]) => Promise<unknown>) {
    this.count += 1;
    this.messagingSystem.publish(
      'QueuedRequestController:countChanged',
      this.count,
    );

    if (this.count > 1) {
      await this.currentRequest;
    }

    this.currentRequest = requestNext()
      .then(() => {
        this.count -= 1;
        this.messagingSystem.publish(
          'QueuedRequestController:countChanged',
          this.count,
        );
      })
      .catch((e) => {
        this.count -= 1;
        this.messagingSystem.publish(
          'QueuedRequestController:countChanged',
          this.count,
        );
        throw e;
      });

    await this.currentRequest;
  }
}
