// src/createStreamMiddleware.ts
import SafeEventEmitter from "@metamask/safe-event-emitter";
import {
  hasProperty
} from "@metamask/utils";
import { Duplex } from "readable-stream";
function createStreamMiddleware(options = {}) {
  const idMap = {};
  const stream = new Duplex({
    objectMode: true,
    read: () => void 0,
    write: processMessage
  });
  const events = new SafeEventEmitter();
  const middleware = (req, res, next, end) => {
    idMap[req.id] = { req, res, next, end };
    sendToStream(req);
  };
  return { events, middleware, stream };
  function sendToStream(req) {
    stream.push(req);
  }
  function processMessage(res, _encoding, streamWriteCallback) {
    let errorObj = null;
    try {
      const isNotification = !hasProperty(res, "id");
      if (isNotification) {
        processNotification(res);
      } else {
        processResponse(res);
      }
    } catch (_err) {
      errorObj = _err;
    }
    streamWriteCallback(errorObj);
  }
  function processResponse(res) {
    const { id: responseId } = res;
    if (responseId === null) {
      return;
    }
    const context = idMap[responseId];
    if (!context) {
      console.warn(`StreamMiddleware - Unknown response id "${responseId}"`);
      return;
    }
    delete idMap[responseId];
    Object.assign(context.res, res);
    setTimeout(context.end);
  }
  function processNotification(notif) {
    if (options?.retryOnMessage && notif.method === options.retryOnMessage) {
      retryStuckRequests();
    }
    events.emit("notification", notif);
  }
  function retryStuckRequests() {
    Object.values(idMap).forEach(({ req, retryCount = 0 }) => {
      if (!req.id) {
        return;
      }
      if (retryCount >= 3) {
        throw new Error(
          `StreamMiddleware - Retry limit exceeded for request id "${req.id}"`
        );
      }
      const idMapObject = idMap[req.id];
      if (idMapObject) {
        idMapObject.retryCount = retryCount + 1;
      }
      sendToStream(req);
    });
  }
}

export {
  createStreamMiddleware
};
//# sourceMappingURL=chunk-UL572XET.mjs.map