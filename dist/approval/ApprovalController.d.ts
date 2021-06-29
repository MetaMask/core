import BaseController, { BaseConfig, BaseState } from '../BaseController';
declare const APPROVALS_STORE_KEY = "pendingApprovals";
declare const APPROVAL_COUNT_STORE_KEY = "pendingApprovalCount";
declare type RequestData = Record<string, unknown>;
export interface Approval {
    /**
     * The ID of the approval request.
     */
    id: string;
    /**
     * The origin of the approval request.
     */
    origin: string;
    /**
     * The time that the request was received, per Date.now().
     */
    time: number;
    /**
     * The type of the approval request.
     */
    type: string;
    /**
     * Additional data associated with the request.
     */
    requestData?: RequestData;
}
export interface ApprovalConfig extends BaseConfig {
    showApprovalRequest: () => void;
}
export interface ApprovalState extends BaseState {
    [APPROVALS_STORE_KEY]: {
        [approvalId: string]: Approval;
    };
    [APPROVAL_COUNT_STORE_KEY]: number;
}
/**
 * Controller for managing requests that require user approval.
 *
 * Enables limiting the number of pending requests by origin and type, counting
 * pending requests, and more.
 *
 * Adding a request returns a promise that resolves or rejects when the request
 * is approved or denied, respectively.
 */
export declare class ApprovalController extends BaseController<ApprovalConfig, ApprovalState> {
    private _approvals;
    private _origins;
    private _showApprovalRequest;
    /**
     * @param opts - Options bag
     * @param opts.showApprovalRequest - Function for opening the UI such that
     * the request can be displayed to the user.
     */
    constructor(config: ApprovalConfig, state?: ApprovalState);
    /**
     * Adds an approval request per the given arguments, calls the show approval
     * request function, and returns the associated approval promise.
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
     * @returns The approval promise.
     */
    addAndShowApprovalRequest(opts: {
        id?: string;
        origin: string;
        type: string;
        requestData?: RequestData;
    }): Promise<unknown>;
    /**
     * Adds an approval request per the given arguments and returns the approval
     * promise.
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
     * @returns The approval promise.
     */
    add(opts: {
        id?: string;
        origin: string;
        type: string;
        requestData?: RequestData;
    }): Promise<unknown>;
    /**
     * Gets the info for the approval request with the given id.
     *
     * @param id - The id of the approval request.
     * @returns The approval request data associated with the id.
     */
    get(id: string): Approval | undefined;
    /**
     * Gets the number of pending approvals, by origin and/or type.
     *
     * If only `origin` is specified, all approvals for that origin will be
     * counted, regardless of type.
     * If only `type` is specified, all approvals for that type will be counted,
     * regardless of origin.
     * If both `origin` and `type` are specified, 0 or 1 will be returned.
     *
     * @param opts.origin - An approval origin.
     * @param opts.type - The type of the approval request.
     * @returns The current approval request count for the given origin and/or
     * type.
     */
    getApprovalCount(opts?: {
        origin?: string;
        type?: string;
    }): number;
    /**
     * @returns The current total approval request count, for all types and
     * origins.
     */
    getTotalApprovalCount(): number;
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
    has(opts?: {
        id?: string;
        origin?: string;
        type?: string;
    }): boolean;
    /**
     * Resolves the promise of the approval with the given id, and deletes the
     * approval. Throws an error if no such approval exists.
     *
     * @param id - The id of the approval request.
     * @param value - The value to resolve the approval promise with.
     */
    resolve(id: string, value?: unknown): void;
    /**
     * Rejects the promise of the approval with the given id, and deletes the
     * approval. Throws an error if no such approval exists.
     *
     * @param id - The id of the approval request.
     * @param error - The error to reject the approval promise with.
     */
    reject(id: string, error: Error): void;
    /**
     * Rejects and deletes all approval requests.
     */
    clear(): void;
    /**
     * Implementation of add operation.
     *
     * @param origin - The origin of the approval request.
     * @param type - The type associated with the approval request.
     * @param id - The id of the approval request.
     * @param requestData - The request data associated with the approval request.
     * @returns The approval promise.
     */
    private _add;
    /**
     * Validates parameters to the add method.
     *
     * @param id - The id of the approval request.
     * @param origin - The origin of the approval request.
     * @param type - The type associated with the approval request.
     * @param requestData - The request data associated with the approval request.
     */
    private _validateAddParams;
    /**
     * Adds an entry to _origins.
     * Performs no validation.
     *
     * @param origin - The origin of the approval request.
     * @param type - The type associated with the approval request.
     */
    private _addPendingApprovalOrigin;
    /**
     * Adds an entry to the store.
     * Performs no validation.
     *
     * @param id - The id of the approval request.
     * @param origin - The origin of the approval request.
     * @param type - The type associated with the approval request.
     * @param requestData - The request data associated with the approval request.
     */
    private _addToStore;
    /**
     * Deletes the approval with the given id. The approval promise must be
     * resolved or reject before this method is called.
     * Deletion is an internal operation because approval state is solely
     * managed by this controller.
     *
     * @param id - The id of the approval request to be deleted.
     */
    private _delete;
    /**
     * Gets the approval callbacks for the given id, deletes the entry, and then
     * returns the callbacks for promise resolution.
     * Throws an error if no approval is found for the given id.
     *
     * @param id - The id of the approval request.
     * @returns The promise callbacks associated with the approval request.
     */
    private _deleteApprovalAndGetCallbacks;
    /**
     * Checks whether there are any approvals associated with the given
     * origin.
     *
     * @param origin - The origin to check.
     * @returns True if the origin has no approvals, false otherwise.
     */
    private _isEmptyOrigin;
}
export default ApprovalController;
