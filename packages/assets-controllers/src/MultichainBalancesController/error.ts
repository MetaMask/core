export class BalancesTrackerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BalancesTrackerError';
  }
}

export class PollerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PollerError';
  }
}
