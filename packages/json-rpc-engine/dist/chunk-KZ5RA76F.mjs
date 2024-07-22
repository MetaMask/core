// src/createScaffoldMiddleware.ts
function createScaffoldMiddleware(handlers) {
  return (req, res, next, end) => {
    const handler = handlers[req.method];
    if (handler === void 0) {
      return next();
    }
    if (typeof handler === "function") {
      return handler(req, res, next, end);
    }
    res.result = handler;
    return end();
  };
}

export {
  createScaffoldMiddleware
};
//# sourceMappingURL=chunk-KZ5RA76F.mjs.map