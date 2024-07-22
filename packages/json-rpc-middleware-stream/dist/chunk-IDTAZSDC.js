"use strict";Object.defineProperty(exports, "__esModule", {value: true});// src/createEngineStream.ts
var _readablestream = require('readable-stream');
function createEngineStream(opts) {
  if (!opts?.engine) {
    throw new Error("Missing engine parameter!");
  }
  const { engine } = opts;
  const stream = new (0, _readablestream.Duplex)({ objectMode: true, read: () => void 0, write });
  if (engine.on) {
    engine.on("notification", (message) => {
      stream.push(message);
    });
  }
  return stream;
  function write(req, _encoding, streamWriteCallback) {
    engine.handle(req, (_err, res) => {
      stream.push(res);
    });
    streamWriteCallback();
  }
}



exports.createEngineStream = createEngineStream;
//# sourceMappingURL=chunk-IDTAZSDC.js.map