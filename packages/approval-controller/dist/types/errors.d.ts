export declare class ApprovalRequestNotFoundError extends Error {
    constructor(id: string);
}
export declare class ApprovalRequestNoResultSupportError extends Error {
    constructor(id: string);
}
export declare class NoApprovalFlowsError extends Error {
    constructor();
}
export declare class EndInvalidFlowError extends Error {
    constructor(id: string, flowIds: string[]);
}
export declare class MissingApprovalFlowError extends Error {
    constructor(id: string);
}
//# sourceMappingURL=errors.d.ts.map