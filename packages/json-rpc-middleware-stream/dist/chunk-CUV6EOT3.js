"use strict";Object.defineProperty(exports, "__esModule", {value: true}); function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }// src/createStreamMiddleware.ts
var _safeeventemitter = require('@metamask/safe-event-emitter'); var _safeeventemitter2 = _interopRequireDefault(_safeeventemitter);


var _utils = require('@metamask/utils');
var _readablestream = require('readable-stream');
function createStreamMiddleware(options = {}) {
  const idMap = {};
  const stream = new (0, _readablestream.Duplex)({
    objectMode: true,
    read: () => void 0,
    write: processMessage
  });
  const events = new (0, _safeeventemitter2.default)();
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
      const isNotification = !_utils.hasProperty.call(void 0, res, "id");
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



exports.createStreamMiddleware = createStreamMiddleware;
//# sourceMappingURL=chunk-CUV6EOT3.js.map