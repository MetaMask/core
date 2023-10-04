import type {
  JsonRpcEngineNextCallback,
  JsonRpcEngineEndCallback,
  JsonRpcMiddleware,
} from '@metamask/json-rpc-engine';
import SafeEventEmitter from '@metamask/safe-event-emitter';
import type {
  JsonRpcNotification,
  JsonRpcParams,
  JsonRpcRequest,
  PendingJsonRpcResponse,
} from '@metamask/utils';
import { Duplex } from 'readable-stream';

type IdMapValue = {
  req: JsonRpcRequest;
  res: PendingJsonRpcResponse<JsonRpcParams>;
  next: JsonRpcEngineNextCallback;
  end: JsonRpcEngineEndCallback;
  retryCount?: number;
};

type IdMap = {
  [requestId: string]: IdMapValue;
};

type Options = {
  retryOnMessage?: string;
};

/**
 * Creates a JsonRpcEngine middleware with an associated Duplex stream and
 * EventEmitter. The middleware, and by extension stream, assume that middleware
 * parameters are properly formatted. No runtime type checking or validation is
 * performed.
 *
 * @param options - Configuration options for middleware.
 * @returns The event emitter, middleware, and stream.
 */
export default function createStreamMiddleware(options: Options = {}) {
  const idMap: IdMap = {}; // TODO: replace with actual Map
  const stream = new Duplex({
    objectMode: true,
    read: () => undefined,
    write: processMessage,
  });

  const events = new SafeEventEmitter();

  const middleware: JsonRpcMiddleware<JsonRpcParams, JsonRpcParams> = (
    req,
    res,
    next,
    end,
  ) => {
    // register request on id map *before* sending it to the stream, to avoid race issues
    idMap[req.id as unknown as string] = { req, res, next, end };
    // write req to stream
    sendToStream(req);
  };

  return { events, middleware, stream };

  /**
   * Forwards JSON-RPC request to the stream.
   *
   * @param req - The JSON-RPC request object.
   */
  function sendToStream(req: JsonRpcRequest) {
    // TODO: limiting retries could be implemented here
    stream.push(req);
  }

  /**
   * Writes a JSON-RPC object to the stream.
   *
   * @param res - The JSON-RPC response object.
   * @param _encoding - The stream encoding, not used.
   * @param streamWriteCallback - The stream write callback.
   */
  function processMessage(
    res: PendingJsonRpcResponse<JsonRpcParams>,
    _encoding: unknown,
    streamWriteCallback: (error?: Error | null) => void,
  ) {
    let errorObj: Error | null = null;
    try {
      const isNotification = !res.id;
      if (isNotification) {
        processNotification(res as unknown as JsonRpcNotification);
      } else {
        processResponse(res);
      }
    } catch (_err) {
      errorObj = _err as Error;
    }
    // continue processing stream
    streamWriteCallback(errorObj);
  }

  /**
   * Processes a JSON-RPC response.
   *
   * @param res - The response to process.
   */
  function processResponse(res: PendingJsonRpcResponse<JsonRpcParams>) {
    const responseId = res.id as unknown as string;
    const context = idMap[responseId];
    if (!context) {
      console.warn(`StreamMiddleware - Unknown response id "${responseId}"`);
      return;
    }

    delete idMap[responseId];
    // copy whole res onto original res
    Object.assign(context.res, res);
    // run callback on empty stack,
    // prevent internal stream-handler from catching errors
    setTimeout(context.end);
  }

  /**
   * Processes a JSON-RPC notification.
   *
   * @param notif - The notification to process.
   */
  function processNotification(notif: JsonRpcNotification) {
    if (options?.retryOnMessage && notif.method === options.retryOnMessage) {
      retryStuckRequests();
    }
    events.emit('notification', notif);
  }

  /**
   * Retry pending requests.
   */
  function retryStuckRequests() {
    Object.values(idMap).forEach(({ req, retryCount = 0 }) => {
      // Avoid retrying requests without an id - they cannot have matching responses so retry logic doesn't apply
      // Check for retry count below ensure that a request is not retried more than 3 times
      if (!req.id) {
        return;
      }

      if (retryCount >= 3) {
        throw new Error(
          `StreamMiddleware - Retry limit exceeded for request id "${req.id}"`,
        );
      }

      idMap[req.id].retryCount = retryCount + 1;
      sendToStream(req);
    });
  }
}
