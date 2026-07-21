/**
 * This file is auto generated.
 * Do not edit manually.
 */

import type { ApprovalController } from './ApprovalController';

/**
 * Adds an approval request per the given arguments, optionally showing
 * the approval request to the user.
 *
 * @param opts - Options bag.
 * @param opts.id - The id of the approval request. A random id will be
 * generated if none is provided.
 * @param opts.origin - The origin of the approval request.
 * @param opts.type - The type associated with the approval request.
 * @param opts.requestData - Additional data associated with the request,
 * if any.
 * @param opts.requestState - Additional state associated with the request,
 * if any.
 * @param shouldShowRequest - Whether to show the approval request to the user.
 * @returns The approval promise.
 */
export type ApprovalControllerAddRequestAction = {
  type: `ApprovalController:addRequest`;
  handler: ApprovalController['addRequest'];
};

/**
 * Adds an approval request per the given arguments, calls the show approval
 * request function, and returns the associated approval promise resolving to
 * an AddResult object.
 *
 * There can only be one approval per origin and type. An error is thrown if
 * attempting to add an invalid or duplicate request.
 *
 * @param opts - Options bag.
 * @param opts.id - The id of the approval request. A random id will be
 * generated if none is provided.
 * @param opts.origin - The origin of the approval request.
 * @param opts.type - The type associated with the approval request.
 * @param opts.requestData - Additional data associated with the request,
 * @param opts.requestState - Additional state associated with the request,
 * if any.
 * @returns The approval promise resolving to an AddResult object.
 */
export type ApprovalControllerAddAndShowApprovalRequestAction = {
  type: `ApprovalController:addAndShowApprovalRequest`;
  handler: ApprovalController['addAndShowApprovalRequest'];
};

/**
 * Adds an approval request per the given arguments and returns the approval
 * promise resolving to an AddResult object.
 *
 * There can only be one approval per origin and type. An error is thrown if
 * attempting to add an invalid or duplicate request.
 *
 * @param opts - Options bag.
 * @param opts.id - The id of the approval request. A random id will be
 * generated if none is provided.
 * @param opts.origin - The origin of the approval request.
 * @param opts.type - The type associated with the approval request.
 * @param opts.requestData - Additional data associated with the request,
 * if any.
 * @returns The approval promise resolving to an AddResult object.
 */
export type ApprovalControllerAddAction = {
  type: `ApprovalController:add`;
  handler: ApprovalController['add'];
};

/**
 * Gets the info for the approval request with the given id.
 *
 * @param id - The id of the approval request.
 * @returns The approval request data associated with the id.
 */
export type ApprovalControllerGetAction = {
  type: `ApprovalController:get`;
  handler: ApprovalController['get'];
};

/**
 * Gets the number of pending approvals, by origin and/or type.
 *
 * If only `origin` is specified, all approvals for that origin will be
 * counted, regardless of type.
 * If only `type` is specified, all approvals for that type will be counted,
 * regardless of origin.
 * If both `origin` and `type` are specified, 0 or 1 will be returned.
 *
 * @param opts - The approval count options.
 * @param opts.origin - An approval origin.
 * @param opts.type - The type of the approval request.
 * @returns The current approval request count for the given origin and/or
 * type.
 */
export type ApprovalControllerGetApprovalCountAction = {
  type: `ApprovalController:getApprovalCount`;
  handler: ApprovalController['getApprovalCount'];
};

/**
 * Get the total count of all pending approval requests for all origins.
 *
 * @returns The total pending approval request count.
 */
export type ApprovalControllerGetTotalApprovalCountAction = {
  type: `ApprovalController:getTotalApprovalCount`;
  handler: ApprovalController['getTotalApprovalCount'];
};

/**
 * Checks if there's a pending approval request per the given parameters.
 * At least one parameter must be specified. An error will be thrown if the
 * parameters are invalid.
 *
 * If `id` is specified, all other parameters will be ignored.
 * If `id` is not specified, the method will check for requests that match
 * all of the specified parameters.
 *
 * @param opts - Options bag.
 * @param opts.id - The ID to check for.
 * @param opts.origin - The origin to check for.
 * @param opts.type - The type to check for.
 * @returns `true` if a matching approval is found, and `false` otherwise.
 */
export type ApprovalControllerHasRequestAction = {
  type: `ApprovalController:hasRequest`;
  handler: ApprovalController['hasRequest'];
};

/**
 * Resolves the promise of the approval with the given id, and deletes the
 * approval. Throws an error if no such approval exists.
 *
 * @param id - The id of the approval request.
 * @param value - The value to resolve the approval promise with.
 * @param options - Options bag.
 * @returns A promise that either resolves once a result is provided by
 * the creator of the approval request, or immediately if `options.waitForResult`
 * is `false` or `undefined`.
 */
export type ApprovalControllerAcceptRequestAction = {
  type: `ApprovalController:acceptRequest`;
  handler: ApprovalController['acceptRequest'];
};

/**
 * Rejects the promise of the approval with the given id, and deletes the
 * approval. Throws an error if no such approval exists.
 *
 * @param id - The id of the approval request.
 * @param error - The error to reject the approval promise with.
 */
export type ApprovalControllerRejectRequestAction = {
  type: `ApprovalController:rejectRequest`;
  handler: ApprovalController['rejectRequest'];
};

/**
 * Rejects and deletes all approval requests.
 *
 * @param rejectionError - The JsonRpcError to reject the approval
 * requests with.
 */
export type ApprovalControllerClearRequestsAction = {
  type: `ApprovalController:clearRequests`;
  handler: ApprovalController['clearRequests'];
};

/**
 * Updates the request state of the approval with the given id.
 *
 * @param opts - Options bag.
 * @param opts.id - The id of the approval request.
 * @param opts.requestState - Additional data associated with the request
 */
export type ApprovalControllerUpdateRequestStateAction = {
  type: `ApprovalController:updateRequestState`;
  handler: ApprovalController['updateRequestState'];
};

/**
 * Starts a new approval flow.
 *
 * @param opts - Options bag.
 * @param opts.id - The id of the approval flow.
 * @param opts.loadingText - The loading text that will be associated to the approval flow.
 * @param opts.show - A flag to determine whether the approval should show to the user.
 * @returns The object containing the approval flow id.
 */
export type ApprovalControllerStartFlowAction = {
  type: `ApprovalController:startFlow`;
  handler: ApprovalController['startFlow'];
};

/**
 * Ends the current approval flow.
 *
 * @param opts - Options bag.
 * @param opts.id - The id of the approval flow that will be finished.
 */
export type ApprovalControllerEndFlowAction = {
  type: `ApprovalController:endFlow`;
  handler: ApprovalController['endFlow'];
};

/**
 * Sets the loading text for the approval flow.
 *
 * @param opts - Options bag.
 * @param opts.id - The approval flow loading text that will be displayed.
 * @param opts.loadingText - The loading text that will be associated to the approval flow.
 */
export type ApprovalControllerSetFlowLoadingTextAction = {
  type: `ApprovalController:setFlowLoadingText`;
  handler: ApprovalController['setFlowLoadingText'];
};

/**
 * Show a success page.
 *
 * @param opts - Options bag.
 * @param opts.message - The message text or components to display in the page.
 * @param opts.header - The text or components to display in the header of the page.
 * @param opts.flowToEnd - The ID of the approval flow to end once the success page is approved.
 * @param opts.title - The title to display above the message. Shown by default but can be hidden with `null`.
 * @param opts.icon - The icon to display in the page. Shown by default but can be hidden with `null`.
 * @returns Empty object to support future additions.
 */
export type ApprovalControllerShowSuccessAction = {
  type: `ApprovalController:showSuccess`;
  handler: ApprovalController['showSuccess'];
};

/**
 * Show an error page.
 *
 * @param opts - Options bag.
 * @param opts.message - The message text or components to display in the page.
 * @param opts.header - The text or components to display in the header of the page.
 * @param opts.flowToEnd - The ID of the approval flow to end once the error page is approved.
 * @param opts.title - The title to display above the message. Shown by default but can be hidden with `null`.
 * @param opts.icon - The icon to display in the page. Shown by default but can be hidden with `null`.
 * @returns Empty object to support future additions.
 */
export type ApprovalControllerShowErrorAction = {
  type: `ApprovalController:showError`;
  handler: ApprovalController['showError'];
};

/**
 * Union of all ApprovalController action types.
 */
export type ApprovalControllerMethodActions =
  | ApprovalControllerAddRequestAction
  | ApprovalControllerAddAndShowApprovalRequestAction
  | ApprovalControllerAddAction
  | ApprovalControllerGetAction
  | ApprovalControllerGetApprovalCountAction
  | ApprovalControllerGetTotalApprovalCountAction
  | ApprovalControllerHasRequestAction
  | ApprovalControllerAcceptRequestAction
  | ApprovalControllerRejectRequestAction
  | ApprovalControllerClearRequestsAction
  | ApprovalControllerUpdateRequestStateAction
  | ApprovalControllerStartFlowAction
  | ApprovalControllerEndFlowAction
  | ApprovalControllerSetFlowLoadingTextAction
  | ApprovalControllerShowSuccessAction
  | ApprovalControllerShowErrorAction;
