import * as allExports from '.';

describe('@metamask/logging-controller', () => {
  it('has expected JavaScript exports', () => {
    expect(Object.keys(allExports)).toMatchInlineSnapshot(`
      Array [
        "LogEntry",
        "LoggingControllerState",
        "AddLog",
        "LoggingControllerActions",
        "LoggingControllerMessenger",
        "LoggingController",
        "SigningMethod",
        "SigningStage",
        "EthSignLog",
        "GenericLog",
        "LogType",
      ]
    `);
  });
});
