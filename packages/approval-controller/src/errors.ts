export class ApprovalRequestNotFoundError extends Error {
  constructor(id: string) {
    super(`Approval request with id '${id}' not found.`);
  }
}

export class ApprovalRequestNoResultSupportError extends Error {
  constructor(id: string) {
    super(
      `Approval acceptance requested result but request with id '${id}' does not support it.`,
    );
  }
}
