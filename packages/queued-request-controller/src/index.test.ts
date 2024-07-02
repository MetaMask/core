import * as allExports from '.';

describe('@metamask/queued-request-controller', () => {
  it('has expected JavaScript exports', () => {
    expect(Object.keys(allExports)).toMatchInlineSnapshot(`
      Array [
        "QueuedRequestControllerActionTypes",
        "QueuedRequestControllerEventTypes",
        "QueuedRequestController",
        "createQueuedRequestMiddleware",
      ]
    `);
  });
});
