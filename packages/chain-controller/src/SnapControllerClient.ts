import { type Sender } from '@metamask/keyring-api';
import type { JsonRpcRequest } from '@metamask/keyring-api/dist/JsonRpcRequest';
import type { SnapController } from '@metamask/snaps-controllers';
import type { SnapId } from '@metamask/snaps-sdk';
import { HandlerType } from '@metamask/snaps-utils';
import type { Json } from '@metamask/utils';
import { v4 as uuid } from 'uuid';

/**
 * Implementation of the `Sender` interface that can be used to send requests
 * to a snap through a `SnapController`.
 */
class SnapControllerSender implements Sender {
  #snapId: SnapId;

  #origin: string;

  #controller: SnapController;

  #handler: HandlerType;

  /**
   * Create a new instance of `SnapControllerSender`.
   *
   * @param controller - The `SnapController` instance to send requests to.
   * @param snapId - The ID of the snap to use.
   * @param origin - The sender's origin.
   * @param handler - The handler type.
   */
  constructor(
    controller: SnapController,
    snapId: SnapId,
    origin: string,
    handler: HandlerType,
  ) {
    this.#controller = controller;
    this.#snapId = snapId;
    this.#origin = origin;
    this.#handler = handler;
  }

  /**
   * Send a request to the snap and return the response.
   *
   * @param request - JSON-RPC request to send to the snap.
   * @returns A promise that resolves to the response of the request.
   */
  async send(request: JsonRpcRequest): Promise<Json> {
    return this.#controller.handleRequest({
      snapId: this.#snapId,
      origin: this.#origin,
      handler: this.#handler,
      request,
    }) as Promise<Json>;
  }
}

/**
 * Snap client to submit requests through the `SnapController`.
 */
export class SnapControllerClient {
  #controller: SnapController;

  #sender: SnapControllerSender;

  constructor({
    controller,
    // Follow same pattern than for @metamask/keyring-api
    snapId = 'undefined' as SnapId,
    origin = 'metamask',
  }: {
    controller: SnapController;
    snapId?: SnapId;
    origin?: string;
  }) {
    this.#controller = controller;
    this.#sender = new SnapControllerSender(
      controller,
      snapId,
      origin,
      HandlerType.OnRpcRequest,
    );
  }

  /**
   * Create a new instance of `KeyringSnapControllerClient` with the specified
   * `snapId`.
   *
   * @param snapId - The ID of the snap to use in the new instance.
   * @returns A new instance of `KeyringSnapControllerClient` with the
   * specified snap ID.
   */
  withSnapId(snapId: SnapId): SnapControllerClient {
    return new SnapControllerClient({
      controller: this.#controller,
      snapId,
    });
  }

  /**
   * Get the `SnapController` instance used by this client.
   *
   * @returns The `SnapController` instance used by this client.
   */
  getController(): SnapController {
    return this.#controller;
  }

  submitRequest = async (
    method: string,
    params: Json[] | Record<string, Json>,
  ): Promise<Json> =>
    await this.#sender.send({
      jsonrpc: '2.0',
      method,
      params,
      id: uuid(), // TODO: Should allow caller to define this one
    });
}
