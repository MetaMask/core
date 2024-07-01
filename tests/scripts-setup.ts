// If the code-under-test sets `process.exitCode`, the test process can exit with that code without
// any error messages.
// This ensures that an error message is shown explaining the reason for the failure. We can unset
// the exit code in each affected test as part of the cleanup steps.
afterEach(() => {
  if (process.exitCode !== undefined && process.exitCode !== 0) {
    throw new Error(`Non-zero exit code: ${String(process.exitCode)}`);
  }
});

// Signals that this is a module not a script
export {};
