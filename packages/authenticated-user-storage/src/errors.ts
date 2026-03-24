export class AuthenticatedUserStorageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuthenticatedUserStorageError';
  }
}
