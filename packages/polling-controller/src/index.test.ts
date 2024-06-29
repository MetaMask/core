import * as allExports from '.';

describe('@metamask/polling-controller', () => {
  it('has expected JavaScript exports', () => {
    expect(Object.keys(allExports)).toMatchInlineSnapshot(`
      Array [
        "BlockTrackerPollingControllerOnly",
        "BlockTrackerPollingController",
        "BlockTrackerPollingControllerV1",
        "StaticIntervalPollingControllerOnly",
        "StaticIntervalPollingController",
        "StaticIntervalPollingControllerV1",
        "IPollingController",
      ]
    `);
  });
});
