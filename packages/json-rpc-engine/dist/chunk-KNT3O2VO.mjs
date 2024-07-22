// src/createAsyncMiddleware.ts
function createAsyncMiddleware(asyncMiddleware) {
  return async (request, response, next, end) => {
    let resolveNextPromise;
    const nextPromise = new Promise((resolve) => {
      resolveNextPromise = resolve;
    });
    let returnHandlerCallback = null;
    let nextWasCalled = false;
    const asyncNext = async () => {
      nextWasCalled = true;
      next((runReturnHandlersCallback) => {
        returnHandlerCallback = runReturnHandlersCallback;
        resolveNextPromise();
      });
      return nextPromise;
    };
    try {
      await asyncMiddleware(request, response, asyncNext);
      if (nextWasCalled) {
        await nextPromise;
        returnHandlerCallback(null);
      } else {
        end(null);
      }
    } catch (error) {
      if (returnHandlerCallback) {
        returnHandlerCallback(error);
      } else {
        end(error);
      }
    }
  };
}

export {
  createAsyncMiddleware
};
//# sourceMappingURL=chunk-KNT3O2VO.mjs.map