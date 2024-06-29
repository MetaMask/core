import * as allExports from '.';

describe('@metamask/queued-request-controller', () => {
  it('has expected JavaScript exports', () => {
    expect(Object.keys(allExports)).toMatchInlineSnapshot(`
      Array [
        "QueuedRequestControllerState",
        "QueuedRequestControllerEnqueueRequestAction",
        "QueuedRequestControllerGetStateAction",
        "QueuedRequestControllerStateChangeEvent",
        "QueuedRequestControllerNetworkSwitched",
        "QueuedRequestControllerEvents",
        "QueuedRequestControllerActions",
        "QueuedRequestControllerMessenger",
        "QueuedRequestControllerOptions",
        "QueuedRequestControllerActionTypes",
        "QueuedRequestControllerEventTypes",
        "QueuedRequestController",
        "QueuedRequestMiddlewareJsonRpcRequest",
        "createQueuedRequestMiddleware",
      ]
    `);
  });
});
