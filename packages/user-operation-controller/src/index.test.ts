/**
 * @jest-environment node
 */

import * as allExports from '.';

describe('@metamask/user-operation-controller', () => {
  it('has expected JavaScript exports', () => {
    expect(Object.keys(allExports)).toMatchInlineSnapshot(`
      Array [
        "UserOperationController",
        "UserOperationControllerEventEmitter",
        "UserOperationControllerState",
        "GetUserOperationState",
        "UserOperationStateChange",
        "UserOperationControllerActions",
        "UserOperationControllerEvents",
        "UserOperationControllerMessenger",
        "UserOperationControllerOptions",
        "AddUserOperationRequest",
        "AddUserOperationSwapOptions",
        "AddUserOperationOptions",
        "AddUserOperationResponse",
        "UserOperation",
        "UserOperationStatus",
        "UserOperationError",
        "UserOperationMetadata",
        "PrepareUserOperationRequest",
        "UpdateUserOperationRequest",
        "SignUserOperationRequest",
        "PrepareUserOperationResponse",
        "UpdateUserOperationResponse",
        "SignUserOperationResponse",
        "SmartContractAccount",
        "UserOperationReceipt",
        "SwapsMetadata",
      ]
    `);
  });
});
