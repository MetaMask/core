import {
  getUniqueId
} from "./chunk-6XXPTZV6.mjs";

// src/idRemapMiddleware.ts
function createIdRemapMiddleware() {
  return (request, response, next, _end) => {
    const originalId = request.id;
    const newId = getUniqueId();
    request.id = newId;
    response.id = newId;
    next((done) => {
      request.id = originalId;
      response.id = originalId;
      done();
    });
  };
}

export {
  createIdRemapMiddleware
};
//# sourceMappingURL=chunk-R7LKI5H5.mjs.map