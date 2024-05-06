import { type Sender } from '@metamask/keyring-api';
import type { JsonRpcRequest } from '@metamask/keyring-api/dist/JsonRpcRequest';
import type { SnapController } from '@metamask/snaps-controllers';
import type { SnapId } from '@metamask/snaps-sdk';
import { HandlerType } from '@metamask/snaps-utils';
import type { Json } from '@metamask/utils';
import { v4 as uuid } from 'uuid';

/**
 * Handler for Snap requests.
 */
export type Handler = SnapController['handleRequest'];

/**
 * Implementation of the `Sender` interface that can be used to send requests
 * to a snap through a Snap request handler.
 */
class SnapHandlerSender implements Sender {
  #snapId: SnapId;

  #origin: string;

  #handler: Handler;

  #handlerType: HandlerType;

  /**
   * Create a new instance of `SnapHandlerSender`.
   *
   * @param handler - The Snap request handler to send requests to.
   * @param handlerType - The handler type.
   * @param snapId - The ID of the snap to use.
   * @param origin - The sender's origin.
   */
  constructor(
    handler: Handler,
    handlerType: HandlerType,
    snapId: SnapId,
    origin: string,
  ) {
    this.#snapId = snapId;
    this.#origin = origin;
    this.#handler = handler;
    this.#handlerType = handlerType;
  }

  /**
   * Send a request to the snap and return the response.
   *
   * @param request - JSON-RPC request to send to the snap.
   * @returns A promise that resolves to the response of the request.
   */
  async send(request: JsonRpcRequest): Promise<Json> {
    return this.#handler({
      snapId: this.#snapId,
      origin: this.#origin,
      handler: this.#handlerType,
      request,
    }) as Promise<Json>;
  }
}

/**
 * Snap client to submit requests through a handler that submit requests to
 * a Snap.
 */
export class SnapHandlerClient {
  #handler: Handler;

  #sender: SnapHandlerSender;

  constructor({
    handler,
    // Follow same pattern than for @metamask/keyring-api
    snapId = 'undefined' as SnapId,
    origin = 'metamask',
  }: {
    handler: Handler;
    snapId?: SnapId;
    origin?: string;
  }) {
    this.#handler = handler;
    this.#sender = new SnapHandlerSender(
      handler,
      HandlerType.OnRpcRequest,
      snapId,
      origin,
    );
  }

  /**
   * Create a new instance of `SnapHandlerClient` with the specified
   * `snapId`.
   *
   * @param snapId - The ID of the snap to use in the new instance.
   * @returns A new instance of `SnapHandlerClient` with the
   * specified snap ID.
   */
  withSnapId(snapId: SnapId): SnapHandlerClient {
    return new SnapHandlerClient({
      handler: this.#handler,
      snapId,
    });
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
