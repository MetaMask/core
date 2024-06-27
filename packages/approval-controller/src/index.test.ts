import * as allExports from '.';

describe('@metamask/approval-controller', () => {
  it('has expected JavaScript exports', () => {
    expect(Object.keys(allExports)).toMatchInlineSnapshot(`
      Array [
        "ORIGIN_METAMASK",
        "APPROVAL_TYPE_RESULT_ERROR",
        "APPROVAL_TYPE_RESULT_SUCCESS",
        "ApprovalRequest",
        "ApprovalFlowState",
        "ApprovalControllerState",
        "ApprovalControllerMessenger",
        "ShowApprovalRequest",
        "ResultComponent",
        "ApprovalControllerOptions",
        "AddApprovalOptions",
        "UpdateRequestStateOptions",
        "AcceptOptions",
        "StartFlowOptions",
        "EndFlowOptions",
        "SetFlowLoadingTextOptions",
        "SuccessOptions",
        "ErrorOptions",
        "AcceptResultCallbacks",
        "AddResult",
        "AcceptResult",
        "ApprovalFlowStartResult",
        "SuccessResult",
        "ErrorResult",
        "ApprovalStateChange",
        "ApprovalControllerEvents",
        "ApprovalController",
        "ApprovalRequestNotFoundError",
        "ApprovalRequestNoResultSupportError",
        "NoApprovalFlowsError",
        "EndInvalidFlowError",
        "MissingApprovalFlowError",
      ]
    `);
  });
});
