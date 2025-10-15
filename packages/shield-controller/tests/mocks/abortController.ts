// Define a type for the AbortSignal to satisfy TypeScript
type MockAbortSignal = {
  aborted: boolean;
  addEventListener: jest.Mock;
  removeEventListener: jest.Mock;
  reason?: unknown;
};

// Mock AbortController
export class MockAbortController {
  // Use a partial MockAbortSignal for the signal property
  public signal: MockAbortSignal;

  // Define abort as a Jest Mock Function
  public abort: jest.Mock = jest.fn();

  // eslint-disable-next-line @typescript-eslint/prefer-readonly
  private _abortHandlers: (() => void)[] = [];

  constructor() {
    this.signal = {
      aborted: false,
      addEventListener: jest.fn((event: string, handler: () => void) => {
        if (event === 'abort') {
          this._abortHandlers.push(handler);
        }
      }),
      removeEventListener: jest.fn((event: string, handler: () => void) => {
        if (event === 'abort') {
          const index = this._abortHandlers.indexOf(handler);
          if (index > -1) {
            this._abortHandlers.splice(index, 1);
          }
        }
      }),
    };

    // Set up the abort method to trigger the handlers
    this.abort.mockImplementation((args?: unknown) => {
      this._triggerAbort(args);
    });
  }

  // Internal method to simulate the abort logic
  _triggerAbort(args?: unknown): void {
    // 1. Update the state of the signal
    this.signal.aborted = true;
    this.signal.reason = args;

    // 2. Call all registered abort handlers
    this._abortHandlers.forEach((handler) => {
      try {
        handler();
      } catch {
        // Ignore errors in handlers to prevent test failures
      }
    });
  }
}
