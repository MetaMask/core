"use strict";Object.defineProperty(exports, "__esModule", {value: true});

var _chunkXDGWQHNYjs = require('./chunk-XDGWQHNY.js');

// src/idRemapMiddleware.ts
function createIdRemapMiddleware() {
  return (request, response, next, _end) => {
    const originalId = request.id;
    const newId = _chunkXDGWQHNYjs.getUniqueId.call(void 0, );
    request.id = newId;
    response.id = newId;
    next((done) => {
      request.id = originalId;
      response.id = originalId;
      done();
    });
  };
}



exports.createIdRemapMiddleware = createIdRemapMiddleware;
//# sourceMappingURL=chunk-PBQXMZM5.js.map