import * as allExports from '.';

describe('@metamask/composable-controller', () => {
  it('has expected JavaScript exports', () => {
    expect(Object.keys(allExports)).toMatchInlineSnapshot(`
      Array [
        "ComposableController",
        "isBaseController",
        "isBaseControllerV1",
        "ComposableControllerStateConstraint",
        "ComposableControllerStateChangeEvent",
        "ComposableControllerEvents",
        "ComposableControllerMessenger",
        "LegacyControllerStateConstraint",
        "RestrictedControllerMessengerConstraint",
      ]
    `);
  });
});
