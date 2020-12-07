import SafeEventEmitter from '@metamask/safe-event-emitter';
import { Duplex } from 'readable-stream';
import {
  JsonRpcEngineNextCallback,
  JsonRpcEngineEndCallback,
  JsonRpcNotification,
  JsonRpcMiddleware,
  JsonRpcRequest,
  PendingJsonRpcResponse,
} from 'json-rpc-engine';

interface IdMapValue {
  req: JsonRpcRequest<unknown>;
  res: PendingJsonRpcResponse<unknown>;
  next: JsonRpcEngineNextCallback;
  end: JsonRpcEngineEndCallback;
}

interface IdMap {
  [requestId: string]: IdMapValue;
}

/**
 * Creates a JsonRpcEngine middleware with an associated Duplex stream and
 * EventEmitter. The middleware, and by extension stream, assume that middleware
 * parameters are properly formatted. No runtime type checking or validation is
 * performed.
 *
 * @returns The event emitter, middleware, and stream.
 */
export default function createStreamMiddleware() {
  const idMap: IdMap = {};
  const stream = new Duplex({
    objectMode: true,
    read: readNoop,
    write: processMessage,
  });

  const events = new SafeEventEmitter();

  const middleware: JsonRpcMiddleware<unknown, unknown> = (
    req,
    res,
    next,
    end,
  ) => {
    // write req to stream
    stream.push(req);
    // register request on id map
    idMap[(req.id as unknown) as string] = { req, res, next, end };
  };

  return { events, middleware, stream };

  function readNoop() {
    return false;
  }

  function processMessage(
    res: PendingJsonRpcResponse<unknown>,
    _encoding: unknown,
    cb: (error?: Error | null) => void,
  ) {
    let err;
    try {
      const isNotification = !res.id;
      if (isNotification) {
        processNotification((res as unknown) as JsonRpcNotification<unknown>);
      } else {
        processResponse(res);
      }
    } catch (_err) {
      err = _err;
    }
    // continue processing stream
    cb(err);
  }

  function processResponse(res: PendingJsonRpcResponse<unknown>) {
    const context = idMap[(res.id as unknown) as string];
    if (!context) {
      throw new Error(`StreamMiddleware - Unknown response id "${res.id}"`);
    }

    delete idMap[(res.id as unknown) as string];
    // copy whole res onto original res
    Object.assign(context.res, res);
    // run callback on empty stack,
    // prevent internal stream-handler from catching errors
    setTimeout(context.end);
  }

  function processNotification(res: JsonRpcNotification<unknown>) {
    events.emit('notification', res);
  }
}
