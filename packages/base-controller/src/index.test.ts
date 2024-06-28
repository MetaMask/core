import * as allExports from '.';

describe('@metamask/base-controller', () => {
  it('has expected JavaScript exports', () => {
    expect(Object.keys(allExports)).toMatchInlineSnapshot(`
    Array [
      "BaseConfig",
      "BaseState",
      "Listener",
      "BaseControllerV1",
      "ListenerV2",
      "StateConstraint",
      "StateDeriver",
      "StateMetadata",
      "StatePropertyMetadata",
      "ControllerGetStateAction",
      "ControllerStateChangeEvent",
      "BaseController",
      "getAnonymizedState",
      "getPersistentState",
      "ActionHandler",
      "ExtractActionParameters",
      "ExtractActionResponse",
      "ExtractEventHandler",
      "ExtractEventPayload",
      "GenericEventHandler",
      "SelectorFunction",
      "SelectorEventHandler",
      "ActionConstraint",
      "EventConstraint",
      "NamespacedBy",
      "NotNamespacedBy",
      "NamespacedName",
      "ControllerMessenger",
      "RestrictedControllerMessenger",
    ]`);
  });
});
