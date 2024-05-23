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
 * Send requests to a Snap through a Snap request handler.
 */
class SnapHandlerSender {
  #snapId: SnapId;

  #origin: string;

  #handler: Handler;

  #handlerType: HandlerType;

  /**
   * Constructor for `SnapHandlerSender`.
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
   * Sends a request to the snap and return the response.
   *
   * @param request - JSON-RPC request to send to the snap.
   * @returns A promise that resolves to the response of the request.
   */
  async send(request: JsonRpcRequest): Promise<unknown> {
    return this.#handler({
      snapId: this.#snapId,
      origin: this.#origin,
      handler: this.#handlerType,
      request,
    });
  }
}

/**
 * Snap client to submit requests through a handler that submit requests to
 * a Snap.
 */
export class SnapHandlerClient {
  #handler: Handler;

  #sender: SnapHandlerSender;

  /**
   * Constructor for SnapHandlerClient.
   *
   * @param options - The client options.
   * @param options.handler - A function to submit requests to the Snap handler
   * (this should call the SnapController.handleRequest)
   * @param options.snapId - The Snap ID.
   * @param options.origin - The origin from which the Snap is being invoked.
   */
  constructor({
    handler,
    // Follow same pattern than for @metamask/keyring-api
    snapId,
    origin = 'metamask',
  }: {
    handler: Handler;
    snapId: SnapId;
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
   * Submit a request to the underlying SnapHandlerSender.
   *
   * @param method - The RPC handler method to be called.
   * @param params - The RPC handler parameters.
   * @returns The RPC handler response.
   */
  submitRequest = async (
    method: string,
    params: Json[] | Record<string, Json>,
  ): Promise<unknown> =>
    await this.#sender.send({
      jsonrpc: '2.0',
      method,
      params,
      id: uuid(), // TODO: Should allow caller to define this one
    });
}
