// src/createEngineStream.ts
import { Duplex } from "readable-stream";
function createEngineStream(opts) {
  if (!opts?.engine) {
    throw new Error("Missing engine parameter!");
  }
  const { engine } = opts;
  const stream = new Duplex({ objectMode: true, read: () => void 0, write });
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

export {
  createEngineStream
};
//# sourceMappingURL=chunk-2YBP3PJ2.mjs.map