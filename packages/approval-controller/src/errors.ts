export class ApprovalRequestNotFoundError extends Error {
  constructor(id: string) {
    super(`Approval request with id '${id}' not found.`);
  }
}
