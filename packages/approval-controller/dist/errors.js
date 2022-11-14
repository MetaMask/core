"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ApprovalRequestNotFoundError = void 0;
class ApprovalRequestNotFoundError extends Error {
    constructor(id) {
        super(`Approval request with id '${id}' not found.`);
    }
}
exports.ApprovalRequestNotFoundError = ApprovalRequestNotFoundError;
//# sourceMappingURL=errors.js.map