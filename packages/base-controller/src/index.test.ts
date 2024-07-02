import * as allExports from '.';

describe('@metamask/base-controller', () => {
  it('has expected JavaScript exports', () => {
    expect(Object.keys(allExports)).toMatchInlineSnapshot(`
      Array [
        "BaseControllerV1",
        "BaseController",
        "getAnonymizedState",
        "getPersistentState",
        "ControllerMessenger",
        "RestrictedControllerMessenger",
      ]
    `);
  });
});
