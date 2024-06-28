import * as allExports from '.';

describe('@metamask/logging-controller', () => {
  it('has expected JavaScript exports', () => {
    expect(Object.keys(allExports)).toMatchInlineSnapshot(`
      Array [
        "LoggingController",
        "SigningMethod",
        "SigningStage",
        "LogType",
      ]
    `);
  });
});
